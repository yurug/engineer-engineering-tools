// Component: ActionPanel -- the five text fields a card can carry: override
// rationale, ask-why, ask-context, counter-proposal, feedback. The
// counter-proposal (2026-07-27) is the move the other four could not express:
// none of these options fit, study this instead. Refs are owned by the CALLER
// (CardView) so the keyboard handler (o/w/c/f, NF3) can imperatively focus
// one without this component knowing anything about key bindings.
// Escape blurs (mirrors mock/round2-cards.html: "if target is TEXTAREA...
// Escape blurs" -- letting the global Enter-to-commit binding fire next,
// since it deliberately ignores keydowns while a textarea has focus).
import type { RefObject } from "react";

export interface ActionPanelRefs {
  rationale: RefObject<HTMLTextAreaElement | null>;
  askWhy: RefObject<HTMLTextAreaElement | null>;
  askContext: RefObject<HTMLTextAreaElement | null>;
  counter: RefObject<HTMLTextAreaElement | null>;
  feedback: RefObject<HTMLTextAreaElement | null>;
}

function blurOnEscape(e: React.KeyboardEvent<HTMLTextAreaElement>): void {
  if (e.key === "Escape") e.currentTarget.blur();
}

export function ActionPanel({
  refs,
  rationale,
  askWhyText,
  askContextText,
  counterText,
  feedbackText,
  showRationale,
  onChange,
}: {
  refs: ActionPanelRefs;
  rationale: string;
  askWhyText: string;
  askContextText: string;
  counterText: string;
  feedbackText: string;
  /** Override rationale is shown only once relevant (mode === "override") or already focused -- ask/feedback fields are always reachable (T4: asking never depends on having decided). */
  showRationale: boolean;
  onChange: (
    field: "rationale" | "askWhyText" | "askContextText" | "counterText" | "feedbackText",
    text: string,
  ) => void;
}): React.JSX.Element {
  return (
    <div className="inputs">
      {showRationale && (
        <>
          <label htmlFor="rationale">Override rationale (o)</label>
          <textarea
            id="rationale"
            ref={refs.rationale}
            value={rationale}
            onChange={(e) => onChange("rationale", e.target.value)}
            onKeyDown={blurOnEscape}
          />
        </>
      )}
      <label htmlFor="ask-why">Ask why (w)</label>
      <textarea
        id="ask-why"
        ref={refs.askWhy}
        value={askWhyText}
        onChange={(e) => onChange("askWhyText", e.target.value)}
        onKeyDown={blurOnEscape}
      />
      <label htmlFor="ask-context">Ask for more context (c)</label>
      <textarea
        id="ask-context"
        ref={refs.askContext}
        value={askContextText}
        onChange={(e) => onChange("askContextText", e.target.value)}
        onKeyDown={blurOnEscape}
      />
      <label htmlFor="counter">None of these fit; study instead (p)</label>
      <textarea
        id="counter"
        ref={refs.counter}
        value={counterText}
        onChange={(e) => onChange("counterText", e.target.value)}
        onKeyDown={blurOnEscape}
      />
      <label htmlFor="feedback">Feedback (f)</label>
      <textarea
        id="feedback"
        ref={refs.feedback}
        value={feedbackText}
        onChange={(e) => onChange("feedbackText", e.target.value)}
        onKeyDown={blurOnEscape}
      />
    </div>
  );
}
