// Module: store/event-log-codec -- backbrief's own per-session log reader,
// built on @brief/core's generic (path-parameterized) log codec
// (ADR-001). This package's naming rule -- one log per SESSION
// (`.backbrief/events/<id>.jsonl`) -- lives here, the one place that still
// speaks in terms of `(repoRoot, sessionId)`; core itself knows nothing
// about sessions.
import * as path from "node:path";
import type { Envelope } from "@backbrief/shared";
import { readEnvelopeLog } from "@brief/core";
import { resolveBackbriefPath } from "../fsguard";

/**
 * Read-only replay of one session's event log, tolerating a torn final line
 * WITHOUT rewriting the file -- for cross-session folds (digest, reader-
 * state) that read historical, possibly-ended sessions.
 * @returns every well-formed envelope in seq order, or `[]` if the file doesn't exist
 */
export function readSessionEnvelopes(repoRoot: string, sessionId: string): Promise<Envelope[]> {
  const filePath = resolveBackbriefPath(repoRoot, path.join("events", `${sessionId}.jsonl`));
  return readEnvelopeLog(filePath);
}
