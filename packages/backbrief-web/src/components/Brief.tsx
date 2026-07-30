// Component: Brief -- the Session activity's shell: Established / This
// brief / Where next (kb/spec/interaction-model.md#the-brief, styled per
// kb/conventions/visual-design.md, structure matching docs/design/
// rethink-mockup-round7-2026-07-19.html).
//
// ONE shell for every content kind (kb/plan.md R7-2's named unknown):
// MoveBrief/TalkBrief/RuptureBrief each mount THIS component with their own
// headline/intent/children -- this file never special-cases which kind it
// is rendering. `next` is omitted entirely (not just given empty tactics)
// to suppress the WHOLE Where-next block -- the paused-for-change moment
// has nothing to choose (visual-design.md's "one primary action" rule:
// showing an inert free textbox during a pause would BE a second,
// competing affordance).
import { useState } from "react";
import { GlossaryText } from "./GlossaryText";
import { AwaitingAgentStatus } from "./AwaitingAgentStatus";
import type { CodeNavTarget } from "../lib/code-nav";
import type { AwaitingAgent } from "../lib/awaiting-agent";
import type { GlossaryTerm } from "@backbrief/shared/browser";

export interface Tactic {
  id: string;
  label: string;
  // `| undefined`, not a bare optional -- matches OfferChoicesPayload's own
  // zod-inferred shape (shared/choices.ts) under `exactOptionalPropertyTypes`,
  // so App.tsx can pass an `offer_choices.choices` entry straight through
  // without a reshape.
  hint?: string | undefined;
}

export interface BriefNext {
  tactics: readonly Tactic[];
  onChoice: (choiceId: string) => void;
  onFreeText: (text: string) => void;
  /** 2026-07-19 (P5's honest-pending indicator): App.tsx's single shared
   *  `useAwaitingAgent` instance for `choice_made` -- "Where next" IS the
   *  screen's one primary action (visual-design.md #4), so ONE instance
   *  covering both the tactic buttons and the free textbox is the right
   *  granularity, not one per tactic. Optional so every existing caller/
   *  test that predates this feature keeps compiling unchanged. */
  awaiting?: AwaitingAgent;
}

const NO_TERMS: readonly GlossaryTerm[] = [];

export function Brief({
  runningHead,
  established,
  headline,
  intent,
  children,
  next,
  terms = NO_TERMS,
  onOpenCitation,
}: {
  /** The mockup's own running head, e.g. "a move" / "a talk" / "your call" -- plain context, not a proof-status claim. */
  runningHead?: string;
  established: readonly string[];
  /** Omitted when no content kind has a headline source yet (interaction-model.md names three: a move's node question, a talk slide's title, or the human's own free answer) -- "This brief" still shows `intent` alone rather than a placeholder. */
  headline?: string;
  intent: string;
  children?: React.ReactNode;
  next?: BriefNext;
  /** R7-3/US15: glossary terms to detect in `intent` -- every content kind's intent gets a glossary card "for free" through this ONE shell, rather than each wrapper (MoveBrief/TalkBrief/RuptureBrief) re-wiring GlossaryText itself. Omitted (or `[]`) degrades silently. */
  terms?: readonly GlossaryTerm[];
  /** R7-3: opens a glossary term's "jump to definition" link (or, via a caller passing it further, a citation) in the Code tab -- lib/code-nav.ts. */
  onOpenCitation?: (target: CodeNavTarget) => void;
}): React.JSX.Element {
  return (
    <article className="brief">
      <div className="brief-head">
        <span className="brief-head-b">BACKBRIEF</span>
        {runningHead !== undefined && <span className="brief-head-r">{runningHead}</span>}
      </div>
      <EstablishedBlock items={established} />
      <div className="brief-block">
        <p className="brief-tag">This brief</p>
        {headline !== undefined && <h2 className="brief-focus">{headline}</h2>}
        <p className="brief-intent">
          <GlossaryText
            text={intent}
            terms={terms}
            {...(onOpenCitation ? { onOpen: onOpenCitation } : {})}
          />
        </p>
        {children !== undefined && <div className="brief-body">{children}</div>}
      </div>
      {next && <WhereNext next={next} />}
    </article>
  );
}

/** US13/interaction-model.md: "Established -- ✓ items, derived. Empty on a first session." */
function EstablishedBlock({ items }: { items: readonly string[] }): React.JSX.Element {
  return (
    <div className="brief-block">
      <p className="brief-tag">What you&rsquo;ve established</p>
      <div className="brief-established">
        {items.length === 0 ? (
          <span className="brief-est-none">Nothing yet — this is our first brief together.</span>
        ) : (
          items.map((item, index) => (
            <span className="brief-est-item" key={index}>
              {item}
            </span>
          ))
        )}
      </div>
    </div>
  );
}

/** US13: tactics wired to `choice_made{choiceId}`; the free textbox to
 *  `choice_made{text}` -- interaction-model.md's choices protocol.
 *  2026-07-19: while `next.awaiting` is "working" (P5), the block disables
 *  and shows the honest status -- the dogfood complaint this fixes was
 *  precisely "I clicked a tactic and nothing happened for seconds." A
 *  "queued" (away) agent re-enables everything (lib/awaiting-agent.ts's
 *  own header explains why) -- this never blocks the human from picking a
 *  different tactic or navigating away (interaction-model.md's you-steer
 *  principle). */
function WhereNext({ next }: { next: BriefNext }): React.JSX.Element {
  const [text, setText] = useState("");
  const busy = next.awaiting?.disableControl ?? false;

  function submitFreeText(formEvent: React.FormEvent): void {
    formEvent.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    next.onFreeText(trimmed);
    setText("");
  }

  return (
    <div className="brief-block brief-next">
      <p className="brief-tag">Where next</p>
      {next.tactics.length > 0 && (
        <div className="brief-tactics">
          {next.tactics.map((tactic) => (
            <button
              type="button"
              key={tactic.id}
              className="brief-tactic"
              onClick={() => next.onChoice(tactic.id)}
              disabled={busy}
            >
              <span className="brief-tactic-arrow" aria-hidden="true">
                ›
              </span>
              {tactic.label}
              {tactic.hint !== undefined && (
                <span className="brief-tactic-hint">{tactic.hint}</span>
              )}
            </button>
          ))}
        </div>
      )}
      <form className="brief-own" onSubmit={submitFreeText}>
        <span aria-hidden="true">↳</span>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="or say what you want"
          aria-label="Your own focus"
          disabled={busy}
        />
      </form>
      {next.awaiting && (
        <AwaitingAgentStatus state={next.awaiting.state} label={next.awaiting.label} />
      )}
    </div>
  );
}
