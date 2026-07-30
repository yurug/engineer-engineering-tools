// Module: excludes -- config.json's `excludes` glob matching, one chokepoint
// so tree/coverage/search agree on what "hidden from browsing" means.
//
// kb/spec/config-and-formats.md#configjson: `excludes` is a glob array
// (default `["node_modules/**", "_build/**", "target/**", "dist/**"]`).
// Uses `minimatch` (a small, widely-used, fully-typed glob matcher) rather
// than hand-rolling `**`/`*` semantics -- config.json accepts arbitrary
// user-supplied patterns, and getting glob edge cases wrong here would
// silently leak or hide the wrong files (T3/NF3 adjacent).
import { minimatch } from "minimatch";

/**
 * @param relPath repo-relative path, forward slashes (never a leading `/`)
 * @param excludePatterns config.json's `excludes` glob list
 * @returns true if `relPath` matches any pattern -- `dot: true` so patterns
 *   can match dotfiles/dotdirs (`.cache/**`), matching how `node_modules/**`
 *   is expected to hide everything under it regardless of leading dots
 * @invariant a directory ENTRY itself is hidden by a `dir/**` pattern, not
 *   just its children -- minimatch's `**` requires the trailing slash to
 *   match (`minimatch("hidden", "hidden/**")` is false, only
 *   `minimatch("hidden/", "hidden/**")` is true), which would otherwise
 *   show an empty-looking excluded directory in the tree view. Trying the
 *   trailing-slash form as a second alternative fixes that without
 *   affecting file matches (a file path with an appended slash never
 *   matches a file-shaped pattern like `*.ts`, so this only ever ADDS
 *   directory-entry matches, never removes a legitimate file match) --
 *   found by an integration test asserting an excluded directory
 *   disappears from `GET /api/tree`, not by reading minimatch's docs.
 */
export function isExcluded(relPath: string, excludePatterns: readonly string[]): boolean {
  return excludePatterns.some(
    (pattern) =>
      minimatch(relPath, pattern, { dot: true }) ||
      minimatch(`${relPath}/`, pattern, { dot: true }),
  );
}
