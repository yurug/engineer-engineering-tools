// Module: validate/citation -- the grounded-or-conjecture chokepoint:
// resolves and hashes a single citation's content and decides
// valid/drifted/broken.
//
// Extracted from @backbrief/server (ADR-001, "our P1/P10 machinery,
// whole"). Runs both at initial ingest (right after minting) and again on
// revalidation (HEAD change, session resume, an explicit revalidate call).
// Key design decision: a CodeCitation never stores the cited TEXT, only its
// hash (path/startLine/endLine/rev/contentHash -- no snippet field). So
// drift repair "search[es] for an exact match of the cited text" really
// means: slide a same-sized window across the +/-200-line range and compare
// each candidate's HASH to `citation.contentHash` (same normalization as
// hashing always uses). Hash equality after normalization IS "exact match"
// for content-addressed text; it is also the only formulation possible
// given what a Citation stores.
import {
  hashLines,
  isPropertyIdAnchor,
  headingSlugsOf,
  type Citation,
  type CitationValidationResult,
} from "@brief/shared";
import type { CitationRepoAccess, CitationKbAccess } from "../content-access";
import { splitRealLines } from "../mint";

/** How far on either side of the original range drift repair searches. */
const DRIFT_SEARCH_WINDOW_LINES = 200;

/**
 * Validates one CodeCitation: resolve -> bounds check -> hash compare ->
 * drift repair on mismatch.
 * @invariant never throws for an unresolvable/mismatched citation -- a
 *   validation *result* is always produced, ready to render flagged
 */
export async function validateCodeCitation(
  citation: Extract<Citation, { kind: "code" }>,
  repo: CitationRepoAccess,
): Promise<CitationValidationResult> {
  const content = await repo.readAtRev(citation.rev, citation.path);
  if (content === null) {
    return { citation, state: "broken", reason: `not found: ${citation.path}@${citation.rev}` };
  }
  const lines = splitRealLines(content);
  if (citation.startLine < 1 || citation.endLine > lines.length) {
    return {
      citation,
      state: "broken",
      reason: `line range ${citation.startLine}-${citation.endLine} out of bounds (file has ${lines.length} lines)`,
    };
  }
  const cited = lines.slice(citation.startLine - 1, citation.endLine);
  if (hashLines(cited) === citation.contentHash) {
    return { citation, state: "valid" };
  }
  const span = citation.endLine - citation.startLine + 1;
  const repaired = findUniqueRelocation(lines, citation.contentHash, span, {
    start: Math.max(1, citation.startLine - DRIFT_SEARCH_WINDOW_LINES),
    end: Math.min(lines.length, citation.endLine + DRIFT_SEARCH_WINDOW_LINES),
  });
  if (repaired) {
    return {
      citation: { ...citation, startLine: repaired.startLine, endLine: repaired.endLine },
      state: "drifted",
      reason: `content moved from ${citation.startLine}-${citation.endLine} to ${repaired.startLine}-${repaired.endLine}`,
    };
  }
  return { citation, state: "broken", reason: "content changed; no unique relocation found" };
}

/**
 * Validates one KbCitation: file exists, and the anchor resolves to either
 * a declared property/edge-case ID or a heading slug.
 */
export async function validateKbCitation(
  citation: Extract<Citation, { kind: "kb" }>,
  kb: CitationKbAccess,
): Promise<CitationValidationResult> {
  const content = await kb.readFile(citation.path);
  if (content === null) {
    return { citation, state: "broken", reason: `KB file not found: ${citation.path}` };
  }
  const resolves = isPropertyIdAnchor(citation.anchor)
    ? declaresPropertyId(content, citation.anchor)
    : headingSlugsOf(content).has(citation.anchor);
  return resolves
    ? { citation, state: "valid" }
    : {
        citation,
        state: "broken",
        reason: `anchor not found: ${citation.path}#${citation.anchor}`,
      };
}

const HEADING_LINE = /^#{1,6}\s+(.*)$/;

/**
 * @param id a property/edge-case id like "P1", "NF4", "T9"
 * @returns true if some heading line in `markdown` contains `id` as a whole word
 * @invariant an ID is *declared* when it appears in a heading of that file --
 *   moved here (kb/external/backbrief-internals.md gap found at plan step 1:
 *   this lived alongside backbrief's KB file-reading module, but KbCitation
 *   validation itself -- the thing that calls it -- is core's, and the
 *   check depends on nothing backbrief-specific, only `isPropertyIdAnchor`
 *   (shared))
 */
export function declaresPropertyId(markdown: string, id: string): boolean {
  if (!isPropertyIdAnchor(id)) return false;
  const wordBoundary = new RegExp(`\\b${id}\\b`);
  return markdown
    .split(/\r\n|\r|\n/)
    .some((line) => HEADING_LINE.test(line) && wordBoundary.test(line));
}

/** An inclusive 1-based line range to search within (drift repair's +/-200 window, or a whole file for relocation). */
export interface SearchWindow {
  start: number;
  end: number;
}

/**
 * Searches `window` for every same-sized range whose hash (same
 * normalization as hashing always uses) equals `targetHash`. Shared by
 * citation drift repair (unique-match-only, below) and annotation
 * relocation (which needs the FULL match list to disambiguate multiple
 * hits by context hash rather than giving up immediately).
 */
export function findMatchingRanges(
  allLines: readonly string[],
  targetHash: string,
  span: number,
  window: SearchWindow,
): { startLine: number; endLine: number }[] {
  const matches: { startLine: number; endLine: number }[] = [];
  for (let start = window.start; start + span - 1 <= window.end; start++) {
    const candidate = allLines.slice(start - 1, start - 1 + span);
    if (hashLines(candidate) === targetHash)
      matches.push({ startLine: start, endLine: start + span - 1 });
  }
  return matches;
}

/**
 * @returns the new range if exactly one candidate position matches;
 *   otherwise null (zero or multiple matches -- both render "broken",
 *   because a non-unique match is not a safe re-anchor)
 * @invariant conservative by design -- see module header
 */
export function findUniqueRelocation(
  allLines: string[],
  targetHash: string,
  span: number,
  window: SearchWindow,
): { startLine: number; endLine: number } | null {
  const matches = findMatchingRanges(allLines, targetHash, span, window);
  return matches.length === 1 ? matches[0]! : null;
}
