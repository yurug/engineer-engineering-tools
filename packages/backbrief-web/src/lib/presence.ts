// Module: lib/presence -- the single P5 ("Honest presence") threshold: the
// away cutoff and the present/away classifier every presence-derived UI
// piece must share.
//
// Extracted from components/PresenceChip.tsx (2026-07-19, the "awaiting
// agent" honest-pending indicator work, lib/awaiting-agent.ts) so the
// ORIGINAL presence chip and the NEW per-action "the agent is working /
// queued" status can never drift on what "present" means. Two independent
// copies of the same P5 threshold is exactly the kind of silent divergence
// that would make one of the two indicators lie -- e.g. the chip in the tab
// bar saying "agent away" while a per-action status still claimed
// "working" because it used a different cutoff.
export const AWAY_THRESHOLD_MS = 60_000;

/**
 * @param seenAt the ISO timestamp of the agent's last request
 *   (`GET /api/session`'s `presence.agentSeen`, api-contracts.md), or null
 *   if the agent has never been seen this session
 * @param now the current time in epoch ms -- caller-supplied (not read from
 *   `Date.now()` internally) so this stays a pure function, testable under
 *   fake timers and reusable by a live-ticking caller (lib/live-clock.ts)
 * @returns whether the agent counts as PRESENT under api-contracts.md's
 *   rule ("Away = older than 60s")
 * @invariant P5 this is recomputed fresh on every call, never latched -- a
 *   caller that re-invokes it on a timer (PresenceChip, useAwaitingAgent)
 *   honestly ages a stale timestamp out to "away" instead of freezing
 *   "present" forever once observed.
 */
export function isAgentPresent(seenAt: string | null, now: number): boolean {
  return seenAt !== null && now - new Date(seenAt).getTime() < AWAY_THRESHOLD_MS;
}
