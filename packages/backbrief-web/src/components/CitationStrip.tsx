// Component: CitationStrip -- the per-citation validation badges below a card.
//
// kb/external/markdown-rendering.md: "Citations in cards: refs render as a
// citation strip below the card body (validated state per citation)."
// @invariant P1 valid/drifted/broken are visually distinct (different
// classes/labels, not just a shared "citation" pill) -- see
// ../lib/citation-view.ts for the state->presentation mapping this
// component only applies, never re-derives.
//
// R7-3 (kb/plan.md, "clickable citations everywhere... don't leave any
// citation as dead text"; kb/conventions/visual-design.md: "Citations
// render as `file:line` links (-> Code)"): `onOpen` is OPTIONAL so every
// EXISTING caller/test that renders a strip purely for its validation
// badges keeps working unchanged -- a badge only becomes an interactive
// `<button>` (still styled identically; the proof-status colour carries
// the SAME meaning either way) when a caller actually wires navigation.
import { citationLocationLabel, citationView } from "../lib/citation-view";
import { citationNavTarget, type CodeNavTarget } from "../lib/code-nav";
import type { ValidationEntry } from "../lib/use-backbrief-socket";

export function CitationStrip({
  validation,
  onOpen,
}: {
  validation: ValidationEntry[];
  onOpen?: (target: CodeNavTarget) => void;
}): React.JSX.Element | null {
  if (validation.length === 0) return null;
  return (
    <div className="citation-strip">
      {validation.map((entry, index) => {
        const view = citationView(entry.state);
        const label = (
          <>
            {citationLocationLabel(entry.citation)} · {view.label}
          </>
        );
        // Citations have no stable id of their own; index is safe here
        // because this list is never reordered or filtered in place.
        return onOpen ? (
          <button
            type="button"
            key={index}
            className={`citation-badge citation-link ${view.className}`}
            title={entry.reason ?? view.label}
            onClick={() => onOpen(citationNavTarget(entry.citation))}
          >
            {label}
          </button>
        ) : (
          <span
            key={index}
            className={`citation-badge ${view.className}`}
            title={entry.reason ?? view.label}
          >
            {label}
          </span>
        );
      })}
    </div>
  );
}
