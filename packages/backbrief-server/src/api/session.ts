// Module: api/session -- GET /api/session, POST /api/session/end.
//
// Implements kb/spec/api-contracts.md's rows for these routes and the
// "ended: flush digest, release lock" half of
// kb/spec/algorithms.md#session-lifecycle.
import type { Context } from "hono";
import type { Clock } from "@backbrief/shared";
import type { SessionState } from "../session-state";
import type { Presence } from "../presence";
import type { EventStore } from "../store/event-store";
import type { RepoAccess } from "../repo";
import type { Config } from "../store/config";
import type { ModelStore } from "../store/model-store";
import { writeSession } from "../store/session-store";
import { generateDigest, writeDigest } from "../digest";
import { writeTelemetryLine } from "../telemetry";
import type { TelemetryCounters } from "../telemetry-counters";

export interface SessionRouteDeps {
  sessionState: SessionState;
  presence: Presence;
  clock: Clock;
  repoRoot: string;
  eventStore: EventStore;
  repo: RepoAccess;
  config: Config;
  /** v2 (ADR-005): passed through to `generateDigest` for the "Comprehension map" section. */
  modelStore: ModelStore;
  /** C1 (Phase 5 audit): computed once at startup (server.ts, same value
   *  actions.ts already gates `ask_question` on) -- exposed here so the web
   *  app can render an explicit notice instead of silently downgrading
   *  (error-taxonomy.md's degraded-state rule: "No-KB mode (notice):
   *  navigation/annotation work; grounded features off" -- this was the
   *  missing wire, the mode was computed but never surfaced by any
   *  endpoint). Deliberately NOT added to the `Session` schema itself: it
   *  is server-startup config, not session state, so it rides alongside
   *  `presence` in this response instead. */
  noKbMode: boolean;
  /** v2 step 4 (NF6): the live E_OVER_BUDGET rejection count -- telemetry-counters.ts's module header explains why this can't be folded from the event log like every other telemetry field. */
  telemetryCounters: TelemetryCounters;
  /** Called after the session is marked ended and the digest is flushed --
   *  server.ts uses this to release the lock and schedule process exit. */
  onEnded: () => void;
}

export function getSessionRoute(deps: SessionRouteDeps) {
  return (c: Context): Response => {
    return c.json({
      session: deps.sessionState.get(),
      presence: deps.presence.snapshot(),
      noKbMode: deps.noKbMode,
    });
  };
}

/**
 * @invariant P2/P6 the digest write happens before the response, so a
 *   crash right after `stop` still leaves a consistent on-disk digest
 * @invariant NF6 exactly one telemetry line per session, written here (the
 *   only place a session transitions to "ended")
 */
export function endSessionRoute(deps: SessionRouteDeps) {
  return async (c: Context): Promise<Response> => {
    const ended = {
      ...deps.sessionState.get(),
      status: "ended" as const,
      endedAt: deps.clock.nowIso(),
    };
    deps.sessionState.set(ended);
    await writeSession(deps.repoRoot, ended);
    const digest = await generateDigest(deps.repoRoot, {
      repo: deps.repo,
      config: deps.config,
      clock: deps.clock,
      modelStore: deps.modelStore,
    });
    await writeDigest(deps.repoRoot, digest);
    await writeTelemetryLine(
      deps.repoRoot,
      ended,
      deps.eventStore.readSince(0),
      deps.clock,
      deps.telemetryCounters.budgetRejections(),
    );
    deps.onEnded();
    return c.json({ ok: true });
  };
}
