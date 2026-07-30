// Module: lib/session-status -- derives the LIVE Session.status from the
// envelope stream instead of polling GET /api/session.
//
// NF2: "agent action -> visible in browser < 500ms (local)". `pause_
// for_change`/`resume_session` are ordinary agent ACTIONS the WS socket
// already delivers instantly, exactly like `present_move` (App.tsx's own
// `findCurrentMove` reads the same `frames` stream) -- polling GET /api/
// session (lib/use-presence.ts's 10s cadence) would add up to 10s of lag
// for information the socket already carries. Mirrors lib/repo-moved.ts's
// `findLatestHeadChanged` shape: scan newest-first, return on the first
// hit of either flipping type.
import type { Envelope } from "@backbrief/shared/browser";

export type LiveSessionStatus = "active" | "paused-for-change";

/**
 * @param envelopes the session's envelope stream, in `seq` order (App.tsx's
 *   `frames`/`envelopes` already are -- WS delivery order IS seq order, P6)
 * @returns "paused-for-change" if the most recent of the two rupture-
 *   lifecycle action types is `pause_for_change`; "active" otherwise
 *   (including "neither has ever happened" -- a session starts active,
 *   data-model.md#session)
 * @invariant pedagogy-engine.md#rupture: pause_for_change sets "paused-
 *   for-change", resume_session flips back to "active" -- the two are
 *   mutually exclusive, so "most recent of either wins" is the whole rule.
 */
export function deriveSessionStatus(envelopes: readonly Envelope[]): LiveSessionStatus {
  for (let i = envelopes.length - 1; i >= 0; i--) {
    const type = envelopes[i]!.type;
    if (type === "resume_session") return "active";
    if (type === "pause_for_change") return "paused-for-change";
  }
  return "active";
}
