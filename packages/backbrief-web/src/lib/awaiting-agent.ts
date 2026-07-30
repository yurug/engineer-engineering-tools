// Module: lib/awaiting-agent -- the "the agent is working… / queued" state
// machine behind the honest awaiting-response indicator.
//
// 2026-07-19 dogfood: a click on a tactic, a talk's Continue, a move
// response, or a question is durable INSTANTLY (P2 -- fsynced before the
// browser's ack) but the AGENT is a separate process that then takes real
// seconds/minutes to compose its reply, and during that gap the UI showed
// NOTHING. The click felt like it had no effect. This module is the pure
// state machine; components/AwaitingAgentStatus.tsx is its rendering.
//
// @invariant P5 ("Honest presence"): the label is recomputed LIVE from the
// same presence threshold PresenceChip uses (lib/presence.ts), every tick
// (lib/live-clock.ts), for as long as the awaited response hasn't landed --
// never a fixed "working" claim regardless of reality. If the agent goes
// quiet mid-wait (crosses the 60s away threshold while this hook is still
// waiting), the label honestly flips from "working" to "queued" on its
// own -- this IS the "sensible timeout" a pending indicator needs: it is
// the SAME away rule P5 already defines, not a second, arbitrary number
// invented just for this feature. There is no other timer that hides the
// indicator or silently declares success; the state resolves for real the
// moment a genuine agent envelope answers it.
import { useState } from "react";
import { isAgentPresent } from "./presence";
import { useLiveNow } from "./live-clock";
import type { Envelope } from "@backbrief/shared/browser";

export type AwaitingState = "idle" | "working" | "queued";

export interface AwaitingAgent {
  /** "idle": nothing outstanding, nothing to show. "working": the agent is
   *  present (api-contracts.md's presence rule) and a reply is expected
   *  imminently. "queued": the human's action is durable (P2) but the agent
   *  hasn't been seen inside the away threshold -- it WILL be picked up,
   *  not lost, but nothing is imminent, so the wording must not claim
   *  activity that isn't happening. */
  state: AwaitingState;
  /** The honest status line for the given state, or null when idle. */
  label: string | null;
  /** Whether the just-used control should stay disabled. True only while
   *  "working" -- an imminent reply is the reason to withhold a second
   *  click. A "queued" (away) agent has nothing imminent coming, so there
   *  is no honest reason to lock the human out of trying again or moving
   *  on (interaction-model.md's you-steer principle: the tool never blocks
   *  the human). This is also the indicator's own "sensible timeout":
   *  crossing into "queued" is what re-enables the control. */
  disableControl: boolean;
  /** Call once the qualifying human action's POST has acked, with the
   *  envelope `seq` it returned (P2: only AFTER durability) -- starts (or
   *  restarts, for a control that can fire more than once) the wait. */
  begin: (sinceSeq: number) => void;
}

/**
 * @param envelopes the session's live envelope stream, in `seq` order
 *   (App.tsx's `envelopes` -- WS delivery order IS seq order, P6)
 * @param sinceSeq the acked seq of the human action being awaited
 * @returns true once ANY agent-actor envelope with `seq > sinceSeq` exists.
 *   Deliberately not scoped to a specific response shape (e.g. only
 *   `present_move` for a `choice_made`) -- the honest claim this indicator
 *   makes is narrowly "the agent did something after my click", matching
 *   how interaction-model.md itself treats the agent's next `offer_choices`/
 *   `present_move`/`talk_*`/`answer` interchangeably as "a response that
 *   supersedes" whatever came before it.
 */
function hasAgentResponseSince(envelopes: readonly Envelope[], sinceSeq: number): boolean {
  return envelopes.some((envelope) => envelope.actor === "agent" && envelope.seq > sinceSeq);
}

function labelFor(state: AwaitingState): string | null {
  switch (state) {
    case "working":
      return "the agent is working…";
    case "queued":
      return "queued — the agent will see this when it's back";
    case "idle":
      return null;
  }
}

/**
 * @invariant P2/P5: `begin` must only be called AFTER the triggering POST
 *   has already acked (durable). This hook says nothing about whether the
 *   human's OWN action was saved -- only about the AGENT's reply to it.
 * @invariant Derived state, not effect-synced: "resolved" is computed
 *   fresh from `envelopes`/`sinceSeq` on every render rather than pushed
 *   into a second piece of state, so there is no window where a stale
 *   "still awaiting" render is possible once the agent has actually replied.
 */
export function useAwaitingAgent(
  envelopes: readonly Envelope[],
  agentSeen: string | null,
): AwaitingAgent {
  const [sinceSeq, setSinceSeq] = useState<number | null>(null);
  const now = useLiveNow();

  const resolved = sinceSeq !== null && hasAgentResponseSince(envelopes, sinceSeq);
  if (sinceSeq === null || resolved) {
    return { state: "idle", label: null, disableControl: false, begin: setSinceSeq };
  }

  const state: AwaitingState = isAgentPresent(agentSeen, now) ? "working" : "queued";
  return {
    state,
    label: labelFor(state),
    disableControl: state === "working",
    begin: setSinceSeq,
  };
}
