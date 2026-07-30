// Component: PresenceChip -- the agent's honest presence indicator, plus
// (v2 step 4) the paused-for-change variant.
//
// @invariant P5 "The UI always shows the agent's real availability
// (present/away derived from CLI activity) and never simulates
// responsiveness." "Away" = older than 60s (api-contracts.md). This
// component derives present/away on every render from the raw timestamp
// -- it never latches a "present" state past the 60s window, so a chip
// left open in a background tab still goes honestly stale.
// `paused` (kb/plan.md step 4, pedagogy-engine.md#rupture) takes priority
// over present/away: while the session is paused for a change break, the
// agent's CLI presence is irrelevant noise -- the one honest thing to say
// is what the session is actually doing.
//
// 2026-07-19: the away threshold and the re-render ticker used to be
// defined inline here; both are now shared (lib/presence.ts, lib/live-
// clock.ts) with the new per-action "the agent is working / queued"
// indicator (lib/awaiting-agent.ts) so the two P5-derived UI pieces can
// never classify the SAME timestamp differently.
import { isAgentPresent } from "../lib/presence";
import { useLiveNow } from "../lib/live-clock";

export function PresenceChip({
  agentSeen,
  paused = false,
}: {
  agentSeen: string | null;
  /** kb/plan.md step 4: `Session.status === "paused-for-change"` -- lib/session-status.ts derives it live from the envelope stream. */
  paused?: boolean;
}): React.JSX.Element {
  // Re-renders every few seconds purely to re-evaluate the 60s window even
  // if no new presence poll has landed -- otherwise a chip would only flip
  // to "away" on the NEXT poll tick, up to 10s late on top of the 60s
  // threshold itself.
  const now = useLiveNow();

  if (paused) {
    // pedagogy-engine.md#rupture's exact wording: "the UI shows the paused
    // state (presence chip: 'fixing — session paused')".
    return (
      <span className="presence-chip presence-paused">
        <span className="presence-dot" aria-hidden="true" />
        fixing — session paused
      </span>
    );
  }

  const present = isAgentPresent(agentSeen, now);
  // error-taxonomy.md's exact degraded-state message for the away case;
  // "present" has no analogous spec wording, so it stays a short label.
  const label = present ? "agent present" : "agent away — your input is queued";
  return (
    <span className={present ? "presence-chip presence-present" : "presence-chip presence-away"}>
      <span className="presence-dot" aria-hidden="true" />
      {label}
    </span>
  );
}
