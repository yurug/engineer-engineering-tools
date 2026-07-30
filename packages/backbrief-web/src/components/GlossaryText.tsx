// Component: GlossaryText -- renders one block of agent-authored prose
// (a brief's intent, a move's say, a talk slide's caption, ...) with its
// FIRST occurrence of each detected glossary term (lib/glossary-detect.ts)
// wrapped as a dotted-underline, hover/focus-carded span (US15, kb/
// conventions/visual-design.md: "Glossary terms get a dotted underline +
// hover card").
//
// A drop-in replacement for `{text}` inside whatever `<p>`/`<h2>` already
// renders that field -- callers (Brief.tsx, MoveBrief.tsx, TalkBrief.tsx)
// keep their own wrapping element and CSS class; this component only ever
// returns a fragment of text nodes and interactive spans, never its own
// block element, so it composes into any existing markup without changing
// layout when `terms` is empty (US15: "degrade silently if GET /api/glossary
// returns {terms: []}" -- with no matches, this renders the plain text
// straight through, byte for byte).
import { useMemo, useState } from "react";
import { detectGlossaryTerms } from "../lib/glossary-detect";
import { GlossaryTermCard } from "./GlossaryTermCard";
import type { CodeNavTarget } from "../lib/code-nav";
import type { GlossaryTerm } from "@backbrief/shared/browser";

export function GlossaryText({
  text,
  terms,
  onOpen,
}: {
  text: string;
  terms: readonly GlossaryTerm[];
  onOpen?: (target: CodeNavTarget) => void;
}): React.JSX.Element {
  const matches = useMemo(() => detectGlossaryTerms(text, terms), [text, terms]);
  if (matches.length === 0) return <>{text}</>;

  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  matches.forEach((match, index) => {
    if (match.start > cursor) nodes.push(text.slice(cursor, match.start));
    nodes.push(
      <GlossaryTermSpan key={index} term={match.term} {...(onOpen ? { onOpen } : {})}>
        {text.slice(match.start, match.end)}
      </GlossaryTermSpan>,
    );
    cursor = match.end;
  });
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return <>{nodes}</>;
}

/**
 * One interactive term span -- owns its OWN hover-card visibility, mirroring
 * CodeActivity.tsx's `handleKbRefHover` (mouseover/mouseout -> hover state
 * -> conditionally mounted card) but scoped per-span rather than delegated,
 * because these are plain React-rendered DOM nodes (not a virtualized
 * CodeMirror document CodeActivity has to delegate ONE listener over).
 * Keyboard-accessible: `tabIndex=0` makes it focusable; focus shows the
 * card exactly like hover does; Escape or blur closes it (US15's
 * accessibility floor, kb/conventions/visual-design.md's quality floor:
 * "visible keyboard focus on every control").
 */
function GlossaryTermSpan({
  term,
  onOpen,
  children,
}: {
  term: GlossaryTerm;
  onOpen?: (target: CodeNavTarget) => void;
  children: React.ReactNode;
}): React.JSX.Element {
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  function open(event: React.SyntheticEvent<HTMLSpanElement>): void {
    setAnchorRect(event.currentTarget.getBoundingClientRect());
  }
  function close(): void {
    setAnchorRect(null);
  }
  function onKeyDown(event: React.KeyboardEvent<HTMLSpanElement>): void {
    if (event.key === "Escape") close();
  }

  return (
    <span
      className="glossary-term"
      tabIndex={0}
      onMouseEnter={open}
      onMouseLeave={close}
      onFocus={open}
      onBlur={close}
      onKeyDown={onKeyDown}
      data-testid="glossary-term"
    >
      {children}
      {anchorRect && (
        <GlossaryTermCard term={term} anchorRect={anchorRect} {...(onOpen ? { onOpen } : {})} />
      )}
    </span>
  );
}
