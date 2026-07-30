// Module: api/events -- GET /api/events, GET /api/events/follow (SSE),
// POST /api/events.
//
// Implements kb/spec/api-contracts.md's rows for these three routes. `GET`
// and `follow` are the agent's inbound channel (ADR-001: "events --follow
// run as a background process -- its stdout re-invokes the agent"); `POST`
// is the durable path for human-originated events from the web app (P2:
// "Human inputs go through POST /api/events -- uniform durability path").
import type { Context } from "hono";
import {
  AppError,
  EventSchema,
  mintCodeCitations,
  SYSTEM_EVENT_TYPES,
  type Envelope,
  type Focus,
} from "@backbrief/shared";
import { flipToDialogueIfExploring } from "../watch/mode-flip";
import type { EventStore } from "../store/event-store";
import type { Presence } from "../presence";
import type { RepoAccess } from "../repo";
import type { SessionState } from "../session-state";
import { assertMinted, makeCitationMinter } from "../mint";
import { assertChoiceMadeValid } from "./interaction-guards";

// ADR-001 (plan step 1): the SSE "follow" streaming MECHANISM (backlog +
// gap-free live subscribe + 30s heartbeat) moved to @brief/core as a
// generic scaffold -- it only ever touched `eventStore`/`presence`, never
// the backbrief-domain concerns (`repo`, `sessionState`, pedagogy event
// gating) the OTHER two routes in this file need. Re-exported here so
// app.ts's `followEventsRoute(deps)` call site needs no change (this
// file's fuller `EventsRouteDeps` structurally satisfies core's narrower
// `FollowRouteDeps`).
export { followEventsRoute } from "@brief/core";

export interface EventsRouteDeps {
  eventStore: EventStore;
  presence: Presence;
  repo: RepoAccess;
  /** Step 3: `checkpoint_response{accepted:true}` reads/writes the live Session.focus (algorithms.md: "acceptance updates Session.focus"). */
  sessionState: SessionState;
  /** See app.ts's AppDeps -- keeps the annotation/reader-state derived stores in sync with what was just appended. */
  projectEnvelope: (envelope: Envelope) => Promise<void>;
}

/** `GET /api/events?since=N` -- a plain, one-shot catch-up read (P6: cursor replay is always safe). */
export function getEventsRoute(deps: EventsRouteDeps) {
  return (c: Context): Response => {
    const since = parseSince(c.req.query("since"));
    return c.json(deps.eventStore.readSince(since));
  };
}

/** `POST /api/events` -- durable human-event ingest (P2). */
export function postEventsRoute(deps: EventsRouteDeps) {
  return async (c: Context): Promise<Response> => {
    const actor = c.get("actor");
    const parsed = EventSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      throw new AppError("E_VALIDATION", "malformed event", { issues: parsed.error.issues });
    }
    const event = parsed.data;
    // No bearer token ever identifies as "system" (the two-token scheme has
    // only agent/human) -- system events (head_changed, focus_changed) are
    // appended directly by in-process watcher code, never via this HTTP
    // path, so any external attempt to submit one is rejected outright.
    if (SYSTEM_EVENT_TYPES.has(event.type)) {
      throw new AppError(
        "E_VALIDATION",
        `${event.type} may only be produced by the server itself`,
        {
          type: event.type,
        },
      );
    }
    // P4: "understood"/"contested" states are set only by explicit human
    // action -- the agent can never mark ground as understood.
    if (actor !== "human" && (event.type === "mark_understood" || event.type === "contest")) {
      throw new AppError("E_AUTH", `${event.type} requires the human token (P4)`, {
        type: event.type,
      });
    }
    // P11 (v2, ADR-005): "grasped"/"demonstrated" advance ONLY from a
    // human-token event -- comprehension-map.md's protocol-additions
    // section says so explicitly ("Mastery-advancing events require the
    // human token"). `move_response` and `node_response` are the only two
    // event types that can ever move an overlay entry there (shared/
    // overlay-fold.ts), so both are gated the same way P4 gates
    // mark_understood/contest above.
    if (actor !== "human" && (event.type === "node_response" || event.type === "move_response")) {
      throw new AppError("E_AUTH", `${event.type} requires the human token (P11)`, {
        type: event.type,
      });
    }
    // v2 step 4 (pedagogy-engine.md#rupture): "Event (human):
    // change_break_response" -- spelled out explicitly in the spec, unlike
    // checkpoint_response (no actor annotation there), so this gets the
    // same explicit gate as the P4/P11 checks above rather than staying open.
    if (actor !== "human" && event.type === "change_break_response") {
      throw new AppError("E_AUTH", `${event.type} requires the human token`, {
        type: event.type,
      });
    }
    // pedagogy-engine.md#interaction-modes: "Event (human or system):
    // mode_change" -- the agent is not one of the two allowed attributions.
    // System-attributed mode_change is appended in-process by watch/
    // mode-watcher.ts / watch/mode-flip.ts, never through this HTTP path (an
    // agent token authoring one directly would let the agent flip its own
    // exploring-blocks-present_move gate). Same gate shape as P4/P11/
    // change_break_response above.
    if (actor !== "human" && event.type === "mode_change") {
      throw new AppError("E_AUTH", `${event.type} requires the human token`, {
        type: event.type,
      });
    }
    // C4 (Phase 5 audit): data-model.md marks `kb_proposal`/`resolve_proposal`
    // "(agent)" -- mirrors the P4 gate above, just in the other direction.
    // These two already have a standalone agent-only path
    // (`KbProposalEventSchema`/`ResolveProposalEventSchema`, tried by
    // POST /api/actions's `AgentPostableEventSchema` fallback), so gating
    // them out of THIS route breaks nothing an agent legitimately does --
    // it only closes the human-token hole this endpoint's generic
    // `EventSchema` union left open (no web component posts either type,
    // confirmed before landing this gate).
    if (actor !== "agent" && (event.type === "kb_proposal" || event.type === "resolve_proposal")) {
      throw new AppError("E_AUTH", `${event.type} requires the agent token`, {
        type: event.type,
      });
    }
    // Round-7 (ADR-007, interaction-model.md): "Event (human): choice_made"
    // is the human's steering act; talk_advance/talk_exit are the human's
    // own talk-pacing events -- same explicit human-token gate shape as
    // P4/P11/change_break_response/mode_change above.
    if (
      actor !== "human" &&
      (event.type === "choice_made" || event.type === "talk_advance" || event.type === "talk_exit")
    ) {
      throw new AppError("E_AUTH", `${event.type} requires the human token`, {
        type: event.type,
      });
    }
    // Round-7: choice_made's shape ("exactly one of choiceId/text") and its
    // single-outstanding-offer scoping (this step's named unknown --
    // shared/choices.ts's module header has the full rationale) are
    // checked BEFORE minting, same placement as every other pure
    // structural/ordering guard in this codebase (api/actions.ts's
    // map_upsert/present_move checks, rupture-guards.ts's pause guard).
    if (event.type === "choice_made") {
      assertChoiceMadeValid(deps, event.payload);
    }
    // Minting is not just an agent-side convenience -- an annotation's
    // citation (or a bare `refs` entry) submitted from the browser needs
    // rev/contentHash filled in the same way before it can be stored as a
    // canonical Envelope (data-model.md's citation-minting section makes
    // no actor distinction; only the walked *shape* matters).
    await mintCodeCitations(event, makeCitationMinter(deps.repo));
    const result = await deps.eventStore.append({
      actor,
      type: event.type,
      refs: assertMinted(event.refs),
      payload: event.payload,
      ...(event.clientKey !== undefined ? { clientKey: event.clientKey } : {}),
    });
    if (!result.deduped) {
      await deps.projectEnvelope(result.envelope);
      if (event.type === "checkpoint_response") {
        await applyAcceptedCheckpoint(event.payload.accepted, deps);
      }
      // pedagogy-engine.md#interaction-modes: "any move/node response flips
      // back to dialogue" -- checked HERE, synchronously right after the
      // response is durable (P2), so the flip reads as instant (NF2)
      // rather than waiting on watch/mode-watcher.ts's poll tick, which
      // only handles the OTHER (time-driven) direction. See that module's
      // header for the full split.
      if (event.type === "move_response" || event.type === "node_response") {
        await flipToDialogueIfExploring(deps.eventStore, deps.projectEnvelope);
      }
    }
    return c.json({ id: result.id, seq: result.seq });
  };
}

/**
 * algorithms.md: "propose_checkpoint... proposes shifting the running
 * session's focus... The human answers with checkpoint_response; acceptance
 * updates Session.focus", recorded by a system `focus_changed` event.
 * data-model.md's `checkpoint_response{accepted}` carries no id linking it
 * to a specific proposal (unlike `answer.questionId`) -- this implements
 * the only reading that shape supports: accept/decline applies to the MOST
 * RECENT `propose_checkpoint` in the log (a single-outstanding-checkpoint
 * model). Flagged as a resolved ambiguity, not invented silently: if a
 * future spec revision adds a `checkpointId`, this is the one place to update.
 * @invariant P6 focus_changed is itself an ordinary appended+projected
 *   envelope -- Session.focus's history is reconstructible from the log,
 *   the in-memory SessionState update is just this process's live cache of it
 */
async function applyAcceptedCheckpoint(accepted: boolean, deps: EventsRouteDeps): Promise<void> {
  if (!accepted) return; // a decline changes nothing -- the checkpoint_response event itself is the durable record
  const proposal = findLatestProposeCheckpoint(deps.eventStore.readSince(0));
  if (!proposal) return; // no outstanding proposal to accept -- a stray/duplicate response, not an error
  const session = deps.sessionState.get();
  const nextFocus = proposal.payload.focus;
  deps.sessionState.set({ ...session, focus: nextFocus });
  const result = await deps.eventStore.append({
    actor: "system",
    type: "focus_changed",
    refs: [],
    payload: { from: session.focus, to: nextFocus },
  });
  await deps.projectEnvelope(result.envelope);
}

function findLatestProposeCheckpoint(
  envelopes: readonly Envelope[],
): { payload: { focus: Focus } } | null {
  for (let i = envelopes.length - 1; i >= 0; i--) {
    const envelope = envelopes[i]!;
    if (envelope.type === "propose_checkpoint") {
      return envelope as unknown as { payload: { focus: Focus } };
    }
  }
  return null;
}

function parseSince(raw: string | undefined): number {
  const n = Number(raw ?? "0");
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
