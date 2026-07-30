// Module: store/event-store -- re-exports @brief/core's EventStore
// (ADR-001, "event-store + event-log-codec... with the log path
// parameterized"). backbrief's own per-session naming
// (`.backbrief/events/<sessionId>.jsonl`) is this package's OWN choice of
// that now-required path parameter -- server.ts (the one place that opens a
// LIVE store) computes it explicitly via `resolveBackbriefPath` before
// calling `EventStore.open(filePath, deps)`.
import * as path from "node:path";
import type { Clock, IdGenerator } from "@backbrief/shared";
import { EventStore } from "@brief/core";
import { resolveBackbriefPath } from "../fsguard";

export { EventStore, type AppendInput, type AppendResult } from "@brief/core";
export { readSessionEnvelopes } from "./event-log-codec";

/**
 * Convenience wrapper preserving the pre-extraction `(repoRoot, sessionId,
 * deps)` call shape for every OTHER caller in this package that opens a
 * live per-session store as a test fixture or a derived-store dependency
 * (server.ts itself computes the path inline, at the one place a LIVE
 * store backs a real running session).
 */
export function openSessionEventStore(
  repoRoot: string,
  sessionId: string,
  deps: { ids: IdGenerator; clock: Clock },
): Promise<EventStore> {
  const filePath = resolveBackbriefPath(repoRoot, path.join("events", `${sessionId}.jsonl`));
  return EventStore.open(filePath, deps);
}
