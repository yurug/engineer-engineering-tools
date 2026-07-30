// Component: RuptureBrief -- "This brief" content for the pause-for-change
// lifecycle's two moments (pedagogy-engine.md#rupture): a PROPOSAL
// awaiting Accept/Later, or the actual PAUSED-and-fixing state. Replaces
// ChangeBreakProposal.tsx and App.tsx's old `.session-paused-line` special
// case -- both are now the SAME content kind sharing the Brief shell (kb/
// plan.md R7-2's named unknown), just two variants of its body/Where next.
//
// The paused variant passes NO `next` to Brief -- there is nothing to
// choose while the agent is fixing something (visual-design.md's "one
// primary action" rule: an inert free textbox here would be a second,
// pointless affordance). The proposal variant needs Accept/Later, which is
// NOT the generic offer_choices/choice_made protocol (change_break_response
// is its own message, pedagogy-engine.md#rupture) -- so it renders its own
// "Where next" block using the SAME `.brief-tactic` markup/classes Brief.tsx
// uses, wired to local handlers instead of Brief's `next` prop. Visually
// identical, protocol-correct.
import { useState } from "react";
import { Brief } from "./Brief";
import { postChangeBreakResponse } from "../lib/map-api";
import type { ApiConfig } from "../lib/api";
import type { PendingChangeBreak } from "../lib/change-break";

type Variant = { kind: "proposal"; proposal: PendingChangeBreak } | { kind: "paused" };

export function RuptureBrief({
  api,
  established,
  runningHead,
  variant,
}: {
  api: ApiConfig;
  established: readonly string[];
  runningHead?: string;
  variant: Variant;
}): React.JSX.Element {
  if (variant.kind === "paused") {
    return (
      <Brief
        established={established}
        {...(runningHead !== undefined ? { runningHead } : {})}
        headline="Paused for a change"
        intent="The agent is applying the fix now; it will resume with a delta briefing over exactly what changed."
      />
    );
  }
  return (
    <ProposalBrief
      api={api}
      established={established}
      {...(runningHead !== undefined ? { runningHead } : {})}
      proposal={variant.proposal}
    />
  );
}

function ProposalBrief({
  api,
  established,
  runningHead,
  proposal,
}: {
  api: ApiConfig;
  established: readonly string[];
  runningHead?: string;
  proposal: PendingChangeBreak;
}): React.JSX.Element {
  const [respondedWith, setRespondedWith] = useState<"accepted" | "declined" | null>(null);

  const respond = (accepted: boolean): void => {
    void postChangeBreakResponse(api, accepted).then(() =>
      setRespondedWith(accepted ? "accepted" : "declined"),
    );
  };

  return (
    <Brief
      established={established}
      {...(runningHead !== undefined ? { runningHead } : {})}
      headline="Found something worth fixing"
      intent="The agent wants to pause and fix this before continuing — accept, or leave it for later."
    >
      <p className="rupture-brief-plan">{proposal.plan}</p>
      {respondedWith ? (
        <p className="rupture-brief-sent">
          {respondedWith === "accepted"
            ? "Accepted — the session will pause once the agent starts the fix."
            : "Noted for later — the agenda continues."}
        </p>
      ) : (
        <div className="brief-block brief-next">
          <p className="brief-tag">Where next</p>
          <div className="brief-tactics">
            <button type="button" className="brief-tactic" onClick={() => respond(true)}>
              <span className="brief-tactic-arrow" aria-hidden="true">
                ›
              </span>
              Accept
            </button>
            <button type="button" className="brief-tactic" onClick={() => respond(false)}>
              <span className="brief-tactic-arrow" aria-hidden="true">
                ›
              </span>
              Later
            </button>
          </div>
        </div>
      )}
    </Brief>
  );
}
