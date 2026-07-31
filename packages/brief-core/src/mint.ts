// Module: mint -- fills in a submitted CodeCitationInput's missing
// `rev`/`contentHash` so it becomes a canonical, storable Citation.
//
// Extracted from @backbrief/server (ADR-001, "our P1/P10 machinery,
// whole"). "rev defaults: worktree; contentHash is always computed from the
// resolved content, so the agent never hashes and any supplied hash is
// ignored." Deliberately lenient: an UNRESOLVABLE citation (missing file,
// out-of-range lines) is not a mint-time error -- it still becomes a
// structurally valid Citation (with a sentinel hash that can never equal a
// real sha256 digest), and the validation pass that runs immediately after
// minting re-resolves the same content and reports it "broken" in the
// response the caller sees. A card with an ungroundable citation still
// posts, visibly flagged, rather than the whole action being rejected.
import {
  AppError,
  hashLines,
  type Citation,
  type CitationInput,
} from "@brief/shared";
import type { CitationRepoAccess } from "./content-access";

/** Never a valid sha256 hex digest (odd length) -- guarantees mint never
 *  accidentally produces a false "valid" for content it could not read. */
const UNRESOLVED_SENTINEL = "unresolved";

/**
 * @param repo where to resolve the citation's content from
 * @returns a function suitable for `shared`'s `mintCodeCitations` walker
 * @invariant the caller never computes a hash -- this function is the
 *   entire reason it doesn't have to
 */
export function makeCitationMinter(
  repo: CitationRepoAccess,
): (input: Extract<CitationInput, { kind: "code" }>) => Promise<Citation> {
  return async (input) => {
    const rev = input.rev ?? "worktree";
    const content = await repo.readAtRev(rev, input.path);
    if (content === null) {
      return {
        kind: "code",
        path: input.path,
        startLine: input.startLine,
        endLine: input.endLine,
        rev,
        contentHash: UNRESOLVED_SENTINEL,
      };
    }
    const lines = splitRealLines(content);
    if (input.startLine < 1 || input.endLine > lines.length) {
      return {
        kind: "code",
        path: input.path,
        startLine: input.startLine,
        endLine: input.endLine,
        rev,
        contentHash: UNRESOLVED_SENTINEL,
      };
    }
    // The canonical contentHash is ALWAYS freshly computed from the resolved
    // content here; any hash the caller supplied is ignored, not compared --
    // mint and the validation pass that follows read the SAME current
    // content in the same request, so a fresh citation is always "valid" at
    // ingest. Drift/broken only surface LATER, on revalidation, when this
    // stored hash is compared against then-current content.
    const contentHash = hashLines(
      lines.slice(input.startLine - 1, input.endLine),
    );
    return {
      kind: "code",
      path: input.path,
      startLine: input.startLine,
      endLine: input.endLine,
      rev,
      contentHash,
    };
  };
}

/**
 * Narrows an array of (walker-collected) CitationInputs to canonical
 * Citations, after `mintCodeCitations` has run over the same value. TS
 * cannot see through the walker's in-place mutation, so this is the one
 * place that re-asserts the post-mint invariant with an actual runtime
 * check, rather than an unchecked cast.
 * @throws {AppError} E_INTERNAL if a code citation still lacks rev/contentHash
 *   -- would indicate `mintCodeCitations` was skipped, a programming error
 * @invariant every code citation is canonical (rev+contentHash present) by
 *   the time it reaches the event store
 */
export function assertMinted(citations: readonly CitationInput[]): Citation[] {
  return citations.map((citation) => {
    if (citation.kind === "kb") return citation;
    if (citation.rev === undefined || citation.contentHash === undefined) {
      throw new AppError(
        "E_INTERNAL",
        "citation minting invariant violated: rev/contentHash still missing",
        {
          citation,
        },
      );
    }
    return {
      ...citation,
      rev: citation.rev,
      contentHash: citation.contentHash,
    };
  });
}

/**
 * Splits file content into its logical lines, terminator-aware (handles LF,
 * CRLF, and lone CR uniformly) so no line ever carries a stray `\r`. A
 * single trailing terminator does not count as an extra empty final line,
 * matching how editors number lines.
 */
export function splitRealLines(content: string): string[] {
  const lines = content.split(/\r\n|\r|\n/);
  const last = lines.at(-1);
  return lines.length > 0 && last === "" ? lines.slice(0, -1) : lines;
}
