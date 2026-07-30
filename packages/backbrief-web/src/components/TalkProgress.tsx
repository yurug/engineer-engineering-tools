// Component: TalkProgress -- the talk's step indicator: slide N of
// talk_start.slideCount, each step marked done/here/upcoming (kb/plan.md
// R7-3, visual reference docs/design/rethink-mockup-round7-2026-07-19.html's
// `.steps`/`.stp`).
//
// The mockup's own worked example labels each step with a short name ("one
// breath", "the loop", ...) -- but interaction-model.md's `talk_slide`
// protocol carries no per-slide title (only `say`/`device`/`caption`), so
// there is no data to put on a step besides its number; this renders plain
// numbered markers rather than inventing captions the protocol doesn't
// supply (the mockup is illustrative, kb/conventions/visual-design.md wins
// on any disagreement).
export function TalkProgress({
  current,
  total,
}: {
  /** 0-based, matching `talk_slide.index`. */
  current: number;
  total: number;
}): React.JSX.Element {
  return (
    <ol className="talk-progress" aria-label={`Slide ${String(current + 1)} of ${String(total)}`}>
      {Array.from({ length: total }, (_, index) => {
        const state = index < current ? "done" : index === current ? "here" : "upcoming";
        return (
          <li
            key={index}
            className={`talk-step talk-step-${state}`}
            aria-current={state === "here" ? "step" : undefined}
          >
            <span className="talk-step-marker" aria-hidden="true">
              {state === "done" ? "✓" : index + 1}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
