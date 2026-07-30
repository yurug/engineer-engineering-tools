// Module: glossary -- parses kb/GLOSSARY.md's "**Term** -- definition"
// bullet lines into structured entries for GET /api/glossary (ADR-007's
// glossary term cards, US15).
//
// Implements kb/spec/api-contracts.md's GET /api/glossary row and kb/spec/
// interaction-model.md's glossary feature. Deliberately NOT a general
// markdown-list parser -- mirrors kb-frontmatter.ts's and kb-access.ts's
// own precedent (those modules' own headers make the identical argument):
// this project's KB files use one fixed convention (kb/CLAUDE.md's KB
// Document Quality Standards), so a line-oriented, bullet-shaped regex is
// exact and cheap for THIS repo's own glossary, without pulling in a
// markdown AST dependency ADR-004 doesn't already name.
// Key design decision: the anchor is the ENCLOSING HEADING's slug (the
// `## Core entities`-style section a term bullet falls under), computed
// with `githubHeadingSlug` -- the SAME algorithm kb-access.ts already uses
// for KB anchor validation (P1), so a glossary card's "jump to definition"
// link resolves against the identical slug GET /api/kb's `anchors` list
// would produce for that same heading. A term with no enclosing heading
// (edge case: a bullet before the first heading) falls back to its OWN
// term-as-heading slug instead of an empty anchor -- "or the term slug",
// per the task brief.
import { githubHeadingSlug } from "@brief/shared";

export interface GlossaryTerm {
  term: string;
  definition: string;
  anchor: string;
}

const HEADING_LINE = /^#{1,6}\s+(.*)$/;
// Matches BOTH "- **Term** -- text" and bare "**Term** -- text" -- the
// optional leading "- " is the only shape variance the task brief names.
// The em dash is matched literally (an actual U+2014 character): every
// entry in THIS repo's GLOSSARY.md uses it, and "dumb and precise" means
// NOT also accepting a hyphen or en dash a future edit might use by
// mistake -- a silently wrong split is worse than a term that fails to
// parse and gets noticed.
const TERM_LINE = /^-?\s*\*\*([^*]+)\*\*\s+—\s+(.*)$/;
// A continuation line: indented (part of the same list item, CommonMark's
// lazy-continuation convention for a wrapped bullet), not itself blank.
const CONTINUATION_LINE = /^\s+\S/;

/**
 * @param markdown the raw content of kb/GLOSSARY.md (or any file following
 *   its bullet convention)
 * @returns every `**Term** -- definition` entry found, in document order;
 *   a multi-line (indented-continuation) definition is joined with single
 *   spaces, matching how a reader would read the wrapped bullet as one sentence
 * @invariant pure, no I/O -- server/api/glossary.ts supplies the file content
 */
export function parseGlossary(markdown: string): GlossaryTerm[] {
  const lines = markdown.split(/\r\n|\r|\n/);
  const seenHeadingSlugs = new Map<string, number>();
  const seenTermSlugs = new Map<string, number>();
  const entries: GlossaryTerm[] = [];
  let currentHeadingSlug: string | null = null;
  let current: GlossaryTerm | null = null;

  const closeCurrent = (): void => {
    if (current) entries.push(current);
    current = null;
  };

  for (const line of lines) {
    const heading = HEADING_LINE.exec(line);
    if (heading?.[1] !== undefined) {
      closeCurrent();
      currentHeadingSlug = githubHeadingSlug(heading[1], seenHeadingSlugs);
      continue;
    }
    const term = TERM_LINE.exec(line);
    if (term?.[1] !== undefined && term[2] !== undefined) {
      closeCurrent();
      const termText = term[1].trim();
      const anchor = currentHeadingSlug ?? githubHeadingSlug(termText, seenTermSlugs);
      current = { term: termText, definition: term[2].trim(), anchor };
      continue;
    }
    if (current && CONTINUATION_LINE.test(line)) {
      current.definition = `${current.definition} ${line.trim()}`;
      continue;
    }
    // A blank line (or any other non-continuation line) ends the current
    // entry -- CommonMark's own "a blank line ends the list item" rule,
    // kept dumb: no nested-list/code-fence handling, because GLOSSARY.md's
    // convention never nests those inside a term bullet.
    closeCurrent();
  }
  closeCurrent();
  return entries;
}
