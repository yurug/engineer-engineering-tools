// Component: GlossaryTermCard -- the hover/focus popover for a detected
// glossary term (US15, ADR-007 decision 4): the term, its definition, and a
// link to the glossary entry in Code/KB.
//
// REUSES KbRefHoverCard.tsx's exact pattern (that component's own header
// explains the "fixed popover anchored to the hovered span's own DOM rect"
// design, and why a floating tooltip is the deliberate exception to this
// codebase's docking-over-floating preference) -- the one difference is
// that a glossary definition never needs its OWN fetch: GET /api/glossary
// is read once for the whole session (lib/use-glossary.ts) and every term's
// full definition already sits in memory, so this card is a pure render of
// data its caller already has, not a second live GET /api/kb round trip.
import type { GlossaryTerm } from "@backbrief/shared/browser";
import type { CodeNavTarget } from "../lib/code-nav";

export function GlossaryTermCard({
  term,
  anchorRect,
  onOpen,
}: {
  term: GlossaryTerm;
  /** The hovered `.glossary-term` element's own `getBoundingClientRect()` -- read once by the caller at hover/focus-enter time, same snapshot contract as KbRefHoverCard's `anchorRect`. */
  anchorRect: DOMRect;
  /** Opens `kb/GLOSSARY.md` in the Code tab, scrolled to this term's anchor (lib/code-nav.ts) -- omitted only in tests that don't exercise the link. */
  onOpen?: (target: CodeNavTarget) => void;
}): React.JSX.Element {
  const style: React.CSSProperties = {
    position: "fixed",
    top: anchorRect.bottom + 4,
    left: anchorRect.left,
  };

  return (
    <div
      className="glossary-hovercard"
      style={style}
      role="tooltip"
      data-testid="glossary-hovercard"
    >
      <div className="glossary-hovercard-head">{term.term}</div>
      <p className="glossary-hovercard-def">{term.definition}</p>
      <button
        type="button"
        className="glossary-hovercard-link"
        onClick={() => onOpen?.({ path: "kb/GLOSSARY.md", anchor: term.anchor })}
      >
        kb/GLOSSARY.md#{term.anchor} →
      </button>
    </div>
  );
}
