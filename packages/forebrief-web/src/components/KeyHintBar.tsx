// Component: KeyHintBar -- NF3's discoverability half (kb/properties/non-
// functional.md#NF3): the bindings exist, but a first-time human cannot know
// them unless the screen says so (user feedback, 2026-07-25: "I don't know
// how to move to the next card"). Mirrors mock/round2-cards.html's bottom
// bar, which the approved mock always showed. Prev/next are also clickable
// buttons so navigation is mouse-reachable, not keyboard-only.
export function KeyHintBar({
  onNavigate,
  position,
  total,
}: {
  onNavigate: (delta: 1 | -1) => void;
  position: number;
  total: number;
}): React.JSX.Element {
  return (
    <div className="key-hint-bar" data-testid="key-hint-bar">
      <span className="keys">
        <b>j/k</b> next/prev card · <b>1–4</b> select · <b>a</b> accept default · <b>o</b> override
        · <b>w</b> ask why · <b>c</b> ask for context · <b>p</b> none of these fit · <b>f</b>{" "}
        feedback · <b>Enter</b> commit · <b>Ctrl/Cmd+Enter</b> commit from a field · <b>u</b> undo ·{" "}
        <b>m</b> compare view · <b>,/.</b> step a card's visual back/forward
      </span>
      <span className="nav">
        <button type="button" aria-label="Previous card" onClick={() => onNavigate(-1)}>
          ‹ prev
        </button>
        <span className="pos">
          card {position} / {total}
        </span>
        <button type="button" aria-label="Next card" onClick={() => onNavigate(1)}>
          next ›
        </button>
      </span>
    </div>
  );
}
