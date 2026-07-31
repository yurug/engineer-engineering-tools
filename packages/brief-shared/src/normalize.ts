// Module: normalize -- content normalization + hashing shared by citation
// minting and citation validation.
//
// kb/spec/algorithms.md#citation-validation step 3 requires hash creation
// (minting, at POST /api/actions) and hash verification (validation, at
// render time / revalidation) to apply *exactly* the same normalization --
// otherwise a citation minted on one checkout could read "drifted" on
// another for a reason that has nothing to do with real drift (T3: "content
// hashing normalizes line endings consistently"). This module is the single
// place that normalization is defined; both server/validate and the minting
// path import it rather than reimplementing it.
import { createHash } from "node:crypto";

const BOM = 0xfeff;

/**
 * Normalizes raw text the way kb/spec/algorithms.md#citation-validation
 * step 3 mandates: strip a leading UTF-8 BOM, unify CRLF/CR to LF, strip
 * trailing whitespace per line.
 * @param raw the text to normalize -- may be a whole file or an already-
 *   extracted line range; BOM stripping only ever fires on a real BOM at
 *   position 0, so passing a mid-file fragment is safe (no false strip)
 * @returns the canonical form, lines joined with "\n"
 * @invariant T3 identical logical content normalizes identically across
 *   CRLF/BOM variants
 */
export function normalizeContent(raw: string): string {
  const withoutBom = raw.charCodeAt(0) === BOM ? raw.slice(1) : raw;
  const unifiedNewlines = withoutBom.replace(/\r\n?/g, "\n");
  const lines = unifiedNewlines
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""));
  return lines.join("\n");
}

/**
 * Hashes a cited line range using the canonical normalization, so hashing
 * at mint time and hashing at validation time can never diverge.
 * @param lines the raw lines (`startLine..endLine` inclusive) exactly as
 *   read from disk or `git show`, NOT pre-normalized by the caller
 * @returns sha256 hex digest of the normalized, newline-joined content
 * @invariant P1 drift repair's "exact match" search depends on this being
 *   whitespace/line-ending-insensitive, or trivial re-formatting would read
 *   as drift instead of a match
 * @example
 * hashLines(["const x = 1;\r\n".trimEnd()]) === hashLines(["const x = 1;"])
 */
export function hashLines(lines: readonly string[]): string {
  const normalized = normalizeContent(lines.join("\n"));
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

/** Lines of context padding on each side of an annotation's cited range -- algorithms.md#annotation-anchoring-and-relocation. */
const CONTEXT_PADDING_LINES = 3;

/**
 * Hashes an annotation's DISAMBIGUATION context: the 3 lines before + the
 * cited range + the 3 lines after, same normalization as `hashLines`.
 * server/src/validate/relocate.ts uses this both when an annotation is
 * created (store the context as it was) and when relocating a stale one
 * (hash each CANDIDATE position's surrounding lines and compare) -- one
 * function, so creation and relocation can never compute context
 * differently.
 * @param allLines the file's lines (1-based `startLine`/`endLine`, same
 *   convention as CodeCitation)
 * @invariant P1 near a file boundary, padding clamps rather than wrapping
 *   or erroring -- a citation on line 1 has zero "before" context, not a
 *   crash
 */
export function hashContext(
  allLines: readonly string[],
  startLine: number,
  endLine: number,
): string {
  const before = allLines.slice(
    Math.max(0, startLine - 1 - CONTEXT_PADDING_LINES),
    startLine - 1,
  );
  const cited = allLines.slice(startLine - 1, endLine);
  const after = allLines.slice(endLine, endLine + CONTEXT_PADDING_LINES);
  return hashLines([...before, ...cited, ...after]);
}
