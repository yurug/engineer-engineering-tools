// Component: CardVisual -- the card's one optional visual (card-visual
// round, seq 36/37), shown above the options. Presentational only: it
// displays whatever @forebrief/server already rendered (an SVG string
// carrying @brief/primitives' own trust-frame/provenance stamp) and
// never touches a spec -- "nothing renders client-side from a spec" is the
// decision this component exists to honor. A filmstrip gets the reader-
// paced stepper (P-E in the backbrief repo's kb/primitives/principles.md);
// `stepIndex`/`onStep` are lifted state (lib/use-filmstrip-stepper.ts) so
// the binding table (lib/keyboard.ts's "."/",") and this component's own
// buttons drive the exact same position.
import type { StoredVisual } from "../lib/types";

/** T10 (2026-07-28): the picture is frozen at post time; a citation on the same
 *  card has since broken, so the drawing may describe code that moved. It is NOT
 *  re-rendered — an unchanged spec renders byte-identically — so saying so is the
 *  whole of what can honestly be done. Placed ABOVE the drawing: a warning under
 *  a picture arrives after the picture has been believed. */
function StaleNotice(): React.JSX.Element {
  return (
    <p className="card-visual-stale" data-testid="card-visual-stale" role="note">
      This drawing was made when the card was posted, and a citation on this card no longer matches
      the code. It may show something that has since changed.
    </p>
  );
}

export function CardVisual({
  visual,
  stepIndex,
  onStep,
}: {
  visual: StoredVisual;
  stepIndex: number;
  onStep: (delta: 1 | -1) => void;
}): React.JSX.Element {
  if (visual.kind === "diagram") {
    return (
      <>
        {visual.mayBeStale && <StaleNotice />}
        <div
          className={`card-visual card-visual-diagram${visual.mayBeStale ? " is-stale" : ""}`}
          data-testid="card-visual-diagram"
          // The SVG string is server-rendered by @brief/primitives from a
          // validated spec (PR2: no spec field ever accepts raw markup) --
          // never agent- or user-supplied markup passed through unescaped.
          dangerouslySetInnerHTML={{ __html: visual.svg }}
        />
      </>
    );
  }

  const steps = visual.steps;
  const clamped = Math.min(Math.max(stepIndex, 0), steps.length - 1);
  const step = steps[clamped]!;

  return (
    <div
      className={`card-visual card-visual-filmstrip${visual.mayBeStale ? " is-stale" : ""}`}
      data-testid="card-visual-filmstrip"
    >
      {visual.mayBeStale && <StaleNotice />}
      <div
        className="filmstrip-frame"
        data-testid="filmstrip-frame"
        dangerouslySetInnerHTML={{ __html: step.svg }}
      />
      <p className="filmstrip-caption" data-testid="filmstrip-caption">
        {step.caption}
      </p>
      <div className="filmstrip-controls">
        <button
          type="button"
          aria-label="Previous step"
          disabled={clamped === 0}
          onClick={() => onStep(-1)}
        >
          ‹ step
        </button>
        <span className="filmstrip-pos" data-testid="filmstrip-position">
          step {clamped + 1} / {steps.length}
        </span>
        <button
          type="button"
          aria-label="Next step"
          disabled={clamped === steps.length - 1}
          onClick={() => onStep(1)}
        >
          step ›
        </button>
      </div>
    </div>
  );
}
