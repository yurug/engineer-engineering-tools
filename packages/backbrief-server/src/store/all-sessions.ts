// Module: store/all-sessions -- cross-session envelope ordering.
//
// algorithms.md#reader-state-transitions: "Cross-session fold order:
// sessions ordered by createdAt, events by seq within each -- reader state
// and coverage span ALL sessions of the repo (US7)." One place computes
// that order so reader-state-store.ts and digest.ts (both need "every
// envelope, ever, in the right order") can't disagree on it.
import type { OrderedEnvelope } from "@backbrief/shared";
import { listSessions } from "./session-store";
import { readSessionEnvelopes } from "./event-log-codec";

/**
 * @returns every envelope from every session of this repo, ordered by
 *   session `createdAt` ascending, then `seq` within each session
 * @invariant NF-adjacent: reads each session's log once, sequentially --
 *   fine for the digest/coverage use cases (triggered by a human action or
 *   session_end, not a hot path); not intended for per-request polling
 */
export async function readAllSessionEnvelopesOrdered(repoRoot: string): Promise<OrderedEnvelope[]> {
  const sessions = await listSessions(repoRoot); // session-store.ts returns most-recent-first; re-sort ascending here
  const ascending = [...sessions].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const ordered: OrderedEnvelope[] = [];
  for (const session of ascending) {
    const envelopes = await readSessionEnvelopes(repoRoot, session.id);
    for (const envelope of envelopes) ordered.push({ sessionId: session.id, envelope });
  }
  return ordered;
}
