// Module: api/rupture-guards -- the propose_change_break/pause_for_change/
// resume_session action guards and their post-append side effects.
//
// Implements kb/spec/pedagogy-engine.md#rupture's ordering rule ("pause
// only after acceptance") and the `Session.status` transitions data-
// model.md#session describes (`active` <-> `paused-for-change`). Split out
// of api/actions.ts for the same reason action-guards.ts already is (that
// module's own header): each concern gets one home, the route handler
// stays sequencing-only.
import { AppError, checkPauseAuthorized, type Envelope } from "@backbrief/shared";
import type { EventStore } from "../store/event-store";
import type { SessionState } from "../session-state";
import type { RepoAccess } from "../repo";
import type { KbAccess } from "../kb-access";
import type { ModelStore } from "../store/model-store";
import { runMapStalenessPass } from "../validate/map-staleness";

/** The subset of `ActionsRouteDeps` this module needs -- `actions.ts`'s
 *  own deps bag satisfies this structurally, so callers pass it straight
 *  through with no adapter object to keep in sync. */
export interface RuptureGuardDeps {
  eventStore: EventStore;
  sessionState: SessionState;
  repo: RepoAccess;
  kb: KbAccess;
  modelStore: ModelStore;
  projectEnvelope: (envelope: Envelope) => Promise<void>;
}

/**
 * @throws {AppError} E_VALIDATION if the session is already paused (no
 *   double-pause -- a defensive guard the spec doesn't spell out, but
 *   `resume_session`'s own symmetric "must currently be paused" guard below
 *   makes it the consistent choice)
 * @throws {AppError} E_VALIDATION (via `checkPauseAuthorized`) if no
 *   accepted `change_break_response` backs this findingId -- the
 *   protocol-ordering violation the task brief names explicitly
 * @invariant pedagogy-engine.md#rupture: "pause_for_change {findingId} //
 *   only after acceptance"
 */
export function assertPauseAuthorized(deps: RuptureGuardDeps, findingId: string): void {
  if (deps.sessionState.get().status === "paused-for-change") {
    throw new AppError("E_VALIDATION", "session is already paused for a change break", {
      field: "status",
    });
  }
  const check = checkPauseAuthorized(deps.eventStore.readSince(0), findingId);
  if (!check.ok) throw check.error;
}

/** @throws {AppError} E_VALIDATION if `resume_session` is posted while the session isn't paused. */
export function assertResumable(deps: RuptureGuardDeps): void {
  if (deps.sessionState.get().status !== "paused-for-change") {
    throw new AppError("E_VALIDATION", "resume_session requires an already-paused session", {
      field: "status",
    });
  }
}

/**
 * Flips `Session.status` to "paused-for-change" -- only the in-memory
 * handle updates, matching `focus_changed`'s own precedent (server/api/
 * events.ts's `applyAcceptedCheckpoint`): mid-session `Session` edits are
 * never re-persisted to disk until `session_end` (store/session-store.ts's
 * `writeSession` has exactly one call site, endSessionRoute).
 */
export function applyPauseSideEffect(deps: RuptureGuardDeps): Promise<void> {
  const session = deps.sessionState.get();
  deps.sessionState.set({ ...session, status: "paused-for-change" });
  return Promise.resolve();
}

/**
 * Flips `Session.status` back to "active" and runs the SAME unscoped
 * staleness pass server.ts's session-start trigger and watch/head-
 * watcher.ts's head_changed trigger already use (validate/map-
 * staleness.ts's `runMapStalenessPass`) -- pedagogy-engine.md#rupture's
 * "citations re-checked, overlay staleness pass runs, nodes_invalidated
 * emitted" is this ONE pass, reused rather than forked a third time (task
 * brief: "REUSE the existing head_changed/session-start staleness
 * machinery, do not fork it"). The delta briefing itself is agent (skill)
 * behavior over the resulting `nodes_invalidated`, not server logic.
 */
export async function applyResumeSideEffect(deps: RuptureGuardDeps): Promise<void> {
  const session = deps.sessionState.get();
  deps.sessionState.set({ ...session, status: "active" });
  await runMapStalenessPass(deps, "revalidate");
}
