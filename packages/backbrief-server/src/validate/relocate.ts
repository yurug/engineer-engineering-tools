// Module: validate/relocate -- annotation relocation on load, per
// kb/spec/algorithms.md#annotation-anchoring-and-relocation.
//
// Runs ONLY after ordinary citation validation reports `broken` (an
// annotation whose citation still validates -- valid, or drifted within
// citation.ts's own ±200-line window -- never reaches this module).
// Implementation notes (mirrors validate/citation.ts's own 2026-07-11 note
// style):
// 1. "search... over the repo (same basename first)" is implemented as
//    same-basename files ONLY, not an unbounded whole-repo content scan --
//    algorithms.md's agent note says drift repair "is intentionally
//    conservative... do not add fuzzy matching without a new ADR", and
//    matching arbitrary unrelated files by exact hash risks a false
//    re-anchor (premortem №7's "one unforgivable failure") for no real
//    benefit over same-named candidates. Flagged in the step-2 report.
// 2. The repo-wide search escalates only when the SAME FILE yields ZERO
//    matches. A same-file result that is ambiguous (multiple hits) and
//    fails contextHash disambiguation goes straight to "stale" rather than
//    widening the search -- widening would only add MORE candidates to an
//    already-ambiguous set, never resolving it, and searching other files
//    for a range that demonstrably still exists (just ambiguously) in the
//    original file is not what "the content moved" describes.
import { hashContext, hashLines, type Citation } from "@backbrief/shared";
import * as path from "node:path";
import type { RepoAccess } from "../repo";
import type { KbAccess } from "../kb-access";
import { splitRealLines } from "../repo";
import { findMatchingRanges, validateCodeCitation, validateKbCitation } from "./citation";

export type RelocationOutcome =
  | { status: "ok"; citation: Citation }
  | { status: "reanchored"; citation: Citation; reason: string }
  | { status: "stale"; reason: string };

/** A candidate relocation position, carrying the file's lines so contextHash disambiguation can run without a second read. */
interface Candidate {
  path: string;
  startLine: number;
  endLine: number;
  lines: string[];
}

/**
 * @param citation the annotation's currently-stored citation
 * @param contextHash the annotation's stored context hash (code citations
 *   only -- data-model.md has no context concept for KB citations)
 * @invariant P1 never re-anchors on a non-unique match -- ambiguity always
 *   resolves to "stale", never a guess
 */
export async function relocateAnnotation(
  citation: Citation,
  contextHash: string | undefined,
  repo: RepoAccess,
  kb: KbAccess,
): Promise<RelocationOutcome> {
  if (citation.kind === "kb") {
    const result = await validateKbCitation(citation, kb);
    // KB relocation has no repair path (algorithms.md: "a renamed heading
    // -> stale") -- the anchor either still resolves or it doesn't.
    return result.state === "valid"
      ? { status: "ok", citation }
      : { status: "stale", reason: result.reason ?? "KB anchor no longer resolves" };
  }
  const validated = await validateCodeCitation(citation, repo);
  if (validated.state !== "broken") return { status: "ok", citation: validated.citation };
  return relocateBrokenCodeCitation(citation, contextHash, repo);
}

async function relocateBrokenCodeCitation(
  citation: Extract<Citation, { kind: "code" }>,
  contextHash: string | undefined,
  repo: RepoAccess,
): Promise<RelocationOutcome> {
  const span = citation.endLine - citation.startLine + 1;
  const sameFile = await candidatesInFile(
    repo,
    citation.rev,
    citation.path,
    citation.contentHash,
    span,
  );

  const resolvedSameFile = pickCandidate(sameFile, contextHash);
  if (resolvedSameFile)
    return reanchored(citation, resolvedSameFile, "re-anchored within the same file");

  if (sameFile.length === 0) {
    const acrossFiles = await candidatesInSameBasenameFiles(repo, citation, span);
    const resolvedAcrossFiles = pickCandidate(acrossFiles, contextHash);
    if (resolvedAcrossFiles)
      return reanchored(citation, resolvedAcrossFiles, "re-anchored in a same-named file");
  }
  return {
    status: "stale",
    reason: "content changed; no unique relocation found (same file or same-named files)",
  };
}

async function candidatesInFile(
  repo: RepoAccess,
  rev: string,
  relPath: string,
  targetHash: string,
  span: number,
): Promise<Candidate[]> {
  const content = await repo.readAtRev(rev, relPath);
  if (content === null) return [];
  const lines = splitRealLines(content);
  return findMatchingRanges(lines, targetHash, span, { start: 1, end: lines.length }).map(
    (match) => ({
      path: relPath,
      startLine: match.startLine,
      endLine: match.endLine,
      lines,
    }),
  );
}

async function candidatesInSameBasenameFiles(
  repo: RepoAccess,
  citation: Extract<Citation, { kind: "code" }>,
  span: number,
): Promise<Candidate[]> {
  const basename = path.basename(citation.path);
  const trackedFiles = await repo.listAllTrackedFiles();
  const sameBasenameFiles = trackedFiles.filter(
    (f) => f !== citation.path && path.basename(f) === basename,
  );
  const candidates: Candidate[] = [];
  for (const candidatePath of sameBasenameFiles) {
    candidates.push(
      ...(await candidatesInFile(repo, citation.rev, candidatePath, citation.contentHash, span)),
    );
  }
  return candidates;
}

/**
 * @returns the single candidate if there is exactly one; if there are
 *   several, the single one whose surrounding context hashes to
 *   `contextHash` (if exactly one does); otherwise null (still ambiguous,
 *   or zero candidates, or no contextHash to disambiguate with)
 */
function pickCandidate(candidates: Candidate[], contextHash: string | undefined): Candidate | null {
  if (candidates.length === 1) return candidates[0]!;
  if (candidates.length === 0 || !contextHash) return null;
  const matches = candidates.filter(
    (c) => hashContext(c.lines, c.startLine, c.endLine) === contextHash,
  );
  return matches.length === 1 ? matches[0]! : null;
}

function reanchored(
  citation: Extract<Citation, { kind: "code" }>,
  candidate: Candidate,
  reason: string,
): RelocationOutcome {
  const contentHash = hashLines(candidate.lines.slice(candidate.startLine - 1, candidate.endLine));
  return {
    status: "reanchored",
    citation: {
      ...citation,
      path: candidate.path,
      startLine: candidate.startLine,
      endLine: candidate.endLine,
      contentHash,
    },
    reason,
  };
}
