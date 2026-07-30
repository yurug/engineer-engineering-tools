// Module: api/actions -- POST /api/actions, the agent's ONLY inbound write path.
//
// Implements kb/spec/api-contracts.md's row for this route and the pipeline
// order kb/plan.md step 1 names explicitly: "zod parse, citation MINTING
// (rev defaults worktree, server computes contentHash) -- then validation
// per algorithms.md incl. drift repair". This handler is deliberately thin:
// each step (parse, mint, validate, diagram-groundedness check, append) is
// a call into a module that owns that concern; this file is only the
// sequencing + HTTP shape.
import type { Context } from "hono";
import {
  ActionSchema,
  AgentPostableEventSchema,
  AppError,
  checkMapUpsert,
  checkMoveBudgets,
  type Envelope,
} from "@backbrief/shared";
import { mintCodeCitations } from "@backbrief/shared";
import type { RepoAccess } from "../repo";
import { memoizeRevReads } from "../repo-cache";
import type { KbAccess } from "../kb-access";
import type { EventStore } from "../store/event-store";
import type { SessionState } from "../session-state";
import type { ModelStore } from "../store/model-store";
import type { TelemetryCounters } from "../telemetry-counters";
import { assertMinted, makeCitationMinter } from "../mint";
import { validateEnvelopeCitations } from "../validate/envelope";
import {
  rejectIfUngroundedDiagram,
  rejectIfUngroundedDevice,
  rejectIfAnyMapNodeCitationBroken,
  type MintableEnvelope,
} from "./action-guards";
import {
  assertPauseAuthorized,
  assertResumable,
  applyPauseSideEffect,
  applyResumeSideEffect,
} from "./rupture-guards";
import {
  assertOfferChoicesValid,
  assertTalkStartValid,
  assertTalkSlideValid,
} from "./interaction-guards";

export interface ActionsRouteDeps {
  eventStore: EventStore;
  repo: RepoAccess;
  kb: KbAccess;
  sessionState: SessionState;
  /** v2 (ADR-005): the current map, consulted by `map_upsert`'s P13 structural check (existing ids/requires-graph) -- kb/plan.md step 1. */
  modelStore: ModelStore;
  /** T2/E_KB_MISSING: `ask_question` (P9) is structurally impossible to satisfy with no KB -- rejected before minting/validation even run. */
  noKbMode: boolean;
  /** v2 step 4 (NF6): incremented on every E_OVER_BUDGET rejection -- telemetry-counters.ts. */
  telemetryCounters: TelemetryCounters;
  /** See app.ts's AppDeps -- keeps the annotation/reader-state derived stores in sync with what was just appended. */
  projectEnvelope: (envelope: Envelope) => Promise<void>;
}

export function actionsRoute(deps: ActionsRouteDeps) {
  return async (c: Context): Promise<Response> => {
    // Actions are, by definition, agent -> app messages (glossary.md#action)
    // -- the human token has no business posting one.
    if (c.get("actor") !== "agent") {
      throw new AppError("E_AUTH", "POST /api/actions requires the agent token");
    }
    const session = deps.sessionState.get();
    if (session.status === "ended") {
      throw new AppError("E_SESSION_ENDED", "this session has ended", {
        sessionId: session.id,
        endedAt: session.endedAt,
      });
    }

    const body: unknown = await c.req.json();
    const parsed = ActionSchema.safeParse(body);
    // api-contracts.md#cli: "act also accepts a small set of agent-
    // producible Events (answer, open_finding, resolve_finding,
    // kb_proposal, resolve_proposal)... routed through POST /api/actions so
    // attribution stays token-derived." None of these are in ActionSchema's
    // union (they're Events, data-model.md), so the combined
    // AgentPostableEventSchema is tried as a fallback ONLY after
    // ActionSchema itself rejects the body -- an actual action never pays
    // the cost of a second parse.
    if (!parsed.success) {
      const eventParsed = AgentPostableEventSchema.safeParse(body);
      if (eventParsed.success) return appendMintedEnvelope(c, deps, eventParsed.data);
      throw new AppError("E_VALIDATION", "malformed action", { issues: parsed.error.issues });
    }
    // T2: E_KB_MISSING -- checked AFTER schema parse (so a malformed
    // ask_question still reports E_VALIDATION, the more specific error)
    // but BEFORE minting/validation, since no amount of citation
    // validation can make an anchor resolve against a KB that doesn't exist.
    if (parsed.data.type === "ask_question" && deps.noKbMode) {
      throw new AppError(
        "E_KB_MISSING",
        "no KB is configured for this repo -- ask_question (P9) requires a KB anchor to challenge",
      );
    }
    // v2 step 4 (ADR-005, pedagogy-engine.md#rupture): checked BEFORE the
    // map_upsert/present_move branch below -- error-taxonomy.md's
    // E_SESSION_PAUSED contract ("present_move rejected... human events
    // still queue"). map_upsert is deliberately NOT gated here: "the fix
    // may reshape the map" (task brief) -- it stays allowed while paused.
    if (parsed.data.type === "present_move" && session.status === "paused-for-change") {
      throw new AppError(
        "E_SESSION_PAUSED",
        "the session is paused for a change break -- human events still queue",
        { sessionId: session.id },
      );
    }
    // v2 (ADR-005, kb/plan.md step 1): P13/P12 checks run BEFORE minting --
    // they are pure, structural, and cheaper than a git read, so a
    // malformed map/move never pays minting's cost. Both throw their own
    // AppError (E_MAP_VALIDATION / E_OVER_BUDGET) on failure.
    if (parsed.data.type === "map_upsert") {
      const existing = deps.modelStore.snapshot().nodes;
      throwIfErr(checkMapUpsert(existing, parsed.data.payload.nodes));
    } else if (parsed.data.type === "present_move") {
      const budgetCheck = checkMoveBudgets(parsed.data.payload);
      // NF6: a rejection never reaches the event log (thrown before
      // append), so the count lives only here -- telemetry-counters.ts's
      // module header explains why this is the one telemetry field that
      // can't be folded from `envelopes` at session_end.
      if (!budgetCheck.ok) {
        deps.telemetryCounters.recordBudgetRejection();
        throw budgetCheck.error;
      }
    } else if (parsed.data.type === "pause_for_change") {
      assertPauseAuthorized(deps, parsed.data.payload.findingId);
    } else if (parsed.data.type === "resume_session") {
      assertResumable(deps);
    } else if (parsed.data.type === "offer_choices") {
      assertOfferChoicesValid(parsed.data.payload); // round-7: same pure-check-before-minting placement
    } else if (parsed.data.type === "talk_start") {
      assertTalkStartValid(parsed.data.payload);
    } else if (parsed.data.type === "talk_slide") {
      assertTalkSlideValid(deps, parsed.data.payload);
    }
    return appendMintedEnvelope(c, deps, parsed.data, ruptureSideEffect(parsed.data.type, deps));
  };
}

/**
 * @returns the post-append hook `pause_for_change`/`resume_session` need
 *   (Session.status flip, plus resume's staleness pass) -- `undefined` for
 *   every other action type, so `appendMintedEnvelope` runs unchanged for them.
 */
function ruptureSideEffect(
  type: string,
  deps: ActionsRouteDeps,
): ((envelope: Envelope) => Promise<void>) | undefined {
  if (type === "pause_for_change") return () => applyPauseSideEffect(deps);
  if (type === "resume_session") return () => applyResumeSideEffect(deps);
  return undefined;
}

async function appendMintedEnvelope(
  c: Context,
  deps: ActionsRouteDeps,
  parsed: MintableEnvelope,
  /** v2 step 4: runs right after the envelope is durable and projected, same "skip on deduped retry" rule as `projectEnvelope` below (a rejected retry's side effect already ran once). */
  onAppended?: (envelope: Envelope) => Promise<void>,
): Promise<Response> {
  // P1 (Phase 5 audit, NF2): one memoizing wrapper for this single request
  // -- minting and validation both resolve the SAME citations via
  // `readAtRev`, so without this they re-spawn `git show` twice per
  // rev-pinned (rev,path). Worktree reads (the common case) are never
  // cached by this wrapper (repo.ts's `memoizeRevReads` docs why) so
  // freshness is unaffected; only immutable, already-committed content is
  // ever reused within this one pass.
  const repoForThisPass = memoizeRevReads(deps.repo);
  await mintCodeCitations(parsed, makeCitationMinter(repoForThisPass));
  const report = await validateEnvelopeCitations(parsed, repoForThisPass, deps.kb);
  rejectIfUngroundedDiagram(parsed, report);
  rejectIfUngroundedDevice(parsed, report);
  if (parsed.type === "map_upsert") rejectIfAnyMapNodeCitationBroken(parsed, report);

  const result = await deps.eventStore.append({
    actor: "agent",
    type: parsed.type,
    refs: assertMinted(parsed.refs),
    payload: parsed.payload,
    ...(parsed.clientKey !== undefined ? { clientKey: parsed.clientKey } : {}),
  });
  // Skip on a deduped retry -- the original submission already projected
  // this envelope (and ran its side effect, if any); re-running either
  // would just recompute an annotation's contextHash (a wasted git read),
  // or double-apply a Session.status flip, for an identical result.
  if (!result.deduped) {
    await deps.projectEnvelope(result.envelope);
    if (onAppended) await onAppended(result.envelope);
  }
  return c.json({ id: result.id, seq: result.seq, report });
}

/** Unwraps a `shared`-produced `Result`, throwing its `AppError` on failure -- the one place pure/Result-returning checks cross into this route's throw-based boundary (conventions/error-handling.md). */
function throwIfErr(result: { ok: true } | { ok: false; error: AppError }): void {
  if (!result.ok) throw result.error;
}
