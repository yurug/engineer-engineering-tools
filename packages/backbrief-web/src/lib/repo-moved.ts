// Module: lib/repo-moved -- finds the latest `head_changed` system event in
// the session's envelope history.
//
// error-taxonomy.md's degraded-state table: "Repo moved (banner):
// head_changed; visible citations revalidate (P8c)." `head_changed` is an
// ordinary envelope, broadcast through the SAME per-envelope WS channel
// every other envelope uses (server/src/watch/head-watcher.ts appends it
// via the normal EventStore -- no special transport) -- so no extra
// socket-hook plumbing is needed to KNOW a head change happened; only to
// derive "what's the latest one" from the envelope list App.tsx already holds.
import type { Envelope } from "@backbrief/shared/browser";

export interface HeadChangedInfo {
  from: string;
  to: string;
  changedPaths: string[];
}

interface HeadChangedPayload {
  from: string;
  to: string;
  changedPaths: string[];
}

/** @returns the most recent (highest-seq) head_changed event's payload, or null if the repo hasn't moved this session. */
export function findLatestHeadChanged(envelopes: readonly Envelope[]): HeadChangedInfo | null {
  let latest: Envelope | null = null;
  for (const envelope of envelopes) {
    if (envelope.type === "head_changed" && (!latest || envelope.seq > latest.seq))
      latest = envelope;
  }
  return latest ? (latest.payload as unknown as HeadChangedPayload) : null;
}
