// Module: lib/glossary-detect -- pure detection of glossary terms inside
// ONE block of agent-authored prose (kb/plan.md R7-3: "detect those terms
// in agent-authored prose... first occurrence per block, whole-word").
//
// "Per block" is satisfied by the CALLER: GlossaryText.tsx runs this once
// per rendered text field (a brief's `intent`, a move's `say`, a talk
// slide's `caption`, ...) -- each call IS one block, so "first occurrence"
// falls straight out of finding the first non-overlapping match per term
// within that one string, with no cross-call state to track.
// Key design decision -- LONGEST TERM FIRST: kb/GLOSSARY.md has genuine
// prefix collisions ("Session" / "Session mode"), and a shorter term
// matching first would claim the span a longer, more specific term should
// have owned instead (annotating "Session" inside "Session mode" as the
// bare "Session" entry is a worse card than the phrase itself). Matching
// longest-first and treating already-claimed spans as unavailable to
// shorter terms resolves this without a second overlap-repair pass.
import type { GlossaryTerm } from "@backbrief/shared/browser";

export interface GlossaryMatch {
  term: GlossaryTerm;
  start: number;
  end: number;
}

/** Regex metacharacters escaped so a term containing one (none currently do,
 *  but GLOSSARY.md is free-text) can never be misread as a pattern. */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** True if [start,end) does not overlap any span already in `claimed`. */
function isFree(
  claimed: readonly { start: number; end: number }[],
  start: number,
  end: number,
): boolean {
  return claimed.every((span) => end <= span.start || start >= span.end);
}

/**
 * @param text one block of rendered prose (a single field's value -- see
 *   module header on what "one block" means here)
 * @param terms the repo's glossary (any order; the SET of distinct terms to
 *   look for, typically GET /api/glossary's full list)
 * @returns every FIRST, non-overlapping, whole-word/phrase occurrence,
 *   longest term preferred on a collision, in READING order (sorted by
 *   `start`) -- GlossaryText.tsx slices `text` at these boundaries to build
 *   its wrapped/plain fragment list
 * @invariant case-SENSITIVE, exact-string match -- GLOSSARY.md entries are
 *   this project's canonical spelling (often acronyms/proper nouns, e.g.
 *   "RESP2"), so a case-insensitive match risks decorating an unrelated
 *   lowercase common word
 */
export function detectGlossaryTerms(text: string, terms: readonly GlossaryTerm[]): GlossaryMatch[] {
  if (text.trim() === "" || terms.length === 0) return [];
  const byLengthDesc = [...terms].sort((a, b) => b.term.length - a.term.length);
  const claimed: GlossaryMatch[] = [];

  for (const term of byLengthDesc) {
    const pattern = new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(term.term)}(?![A-Za-z0-9])`, "g");
    for (const match of text.matchAll(pattern)) {
      const start = match.index;
      const end = start + match[0].length;
      if (isFree(claimed, start, end)) {
        claimed.push({ term, start, end });
        break; // "first occurrence" -- this term is done, move to the next
      }
    }
  }
  return claimed.sort((a, b) => a.start - b.start);
}
