// Module: fsguard -- the single chokepoint every filesystem path passes
// through before a read or write happens.
//
// Extracted from @backbrief/server per ADR-001 (kb/architecture/decisions/
// ADR-001-extract-brief-core-now.md in the forebrief repo): "`stateDirName`
// must be a required option of core's fsguard, not a default -- each
// consumer states its own (`.backbrief`, `.forebrief`)." The ORIGINAL
// backbrief module hardcoded ".backbrief" as a literal in two functions
// (kb/external/backbrief-internals.md: "the one chokepoint to
// parameterize") -- this version takes `stateDirName` as a required
// argument instead, so a typo'd default can never silently confine one
// consumer's writes to another consumer's state directory.
// Key design decision: resolution + the containment check happen in the
// SAME function, atomically in terms of code path, so there is no window
// where a caller resolves a path and forgets to check it.
import * as fs from "node:fs";
import * as path from "node:path";
import { AppError } from "@brief/shared";

/**
 * @returns the realpath of the nearest existing ancestor of `target`
 *   (following every symlink on the way), plus the exact string of `target`
 *   again if no ancestor exists at all (filesystem root always exists in
 *   practice, so this fallback is unreachable outside contrived tests).
 * @invariant the ancestor walk means a symlink that does not yet exist
 *   itself (its PARENT is a symlink, or a grandparent is) is still caught --
 *   a write's target file rarely exists yet; what matters is whether the
 *   directory it would land in has been redirected by a symlink.
 */
function realpathOfNearestExistingAncestor(target: string): string {
  let current = target;
  for (;;) {
    try {
      return fs.realpathSync(current);
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return current; // filesystem root -- nothing left to walk up to
      current = parent;
    }
  }
}

/**
 * Resolves a repo-relative path and guarantees it stays inside `repoRoot`.
 * @param repoRoot absolute path to the host repo
 * @param relPath the untrusted, request-supplied relative path (may contain
 *   `..`, be absolute, or use backslashes on a hostile input)
 * @returns the absolute, resolved path -- guaranteed to be `repoRoot` or a
 *   descendant of it
 * @throws {AppError} E_NOT_FOUND if the resolved path would escape `repoRoot`
 */
export function resolveRepoPath(repoRoot: string, relPath: string): string {
  const root = path.resolve(repoRoot);
  const resolved = path.resolve(root, relPath);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    // Traversal attempts are logged here -- the one place that can see
    // every attempt, by construction.
    console.warn(`[fsguard] path traversal attempt blocked: ${relPath}`);
    throw new AppError("E_NOT_FOUND", `path is outside the repo: ${relPath}`, { path: relPath });
  }
  return resolved;
}

/**
 * Resolves a path for a WRITE, additionally confining it inside
 * `<repoRoot>/<stateDirName>/`. Reads of repo content use `resolveRepoPath`;
 * every store write (event log, server.json, lock, config) uses this one.
 * @param stateDirName the consumer's own state directory name (e.g.
 *   `.backbrief`, `.forebrief`) -- REQUIRED, no default, so a consumer can
 *   never accidentally confine a write to another consumer's directory
 * @throws {AppError} E_INTERNAL if the resolved path would escape
 *   `<stateDirName>/` -- this can only happen from a programming error (no
 *   request ever supplies the write path directly), so it is treated as
 *   internal rather than a user-facing validation failure
 * @invariant Phase-5 audit (forebrief kb/reports/audit-phase5-2026-07-24.md,
 *   item 7, "refuted-but-true"): the string-only check above is NOT enough
 *   -- a symlink PLANTED inside the state dir (e.g. `.forebrief/escape-link
 *   -> /somewhere/else`) resolves to a path whose STRING starts with
 *   `stateRoot`, passing the check above, while the actual write lands
 *   wherever the symlink points. The second check below resolves the
 *   nearest EXISTING ancestor of both `resolved` and `stateRoot` (the
 *   target file itself usually doesn't exist yet -- what matters is
 *   whether the directory it would land in has been redirected) and
 *   compares THOSE real paths instead, catching a planted symlink whether
 *   it names the write target directly or an ancestor directory of it.
 */
export function resolveStateDirPath(
  repoRoot: string,
  stateDirName: string,
  relPath: string,
): string {
  const stateRoot = path.resolve(repoRoot, stateDirName);
  const resolved = path.resolve(stateRoot, relPath);
  if (resolved !== stateRoot && !resolved.startsWith(stateRoot + path.sep)) {
    throw new AppError("E_INTERNAL", `refusing to write outside ${stateDirName}/: ${relPath}`, {
      path: relPath,
    });
  }
  const realStateRoot = realpathOfNearestExistingAncestor(stateRoot);
  const realResolvedAncestor = realpathOfNearestExistingAncestor(resolved);
  if (
    realResolvedAncestor !== realStateRoot &&
    !realResolvedAncestor.startsWith(realStateRoot + path.sep)
  ) {
    throw new AppError(
      "E_INTERNAL",
      `refusing to write outside ${stateDirName}/: ${relPath} (resolves through a symlink escaping the state dir)`,
      { path: relPath },
    );
  }
  return resolved;
}

/**
 * True if a REPO-RELATIVE `relPath` (however written -- `..`, extra
 * slashes, a nested subpath) resolves inside `<repoRoot>/<stateDirName>`.
 * The state directory holds `server.json`, which carries the agent's
 * bearer token -- a content-read endpoint that resolves paths via
 * `resolveRepoPath` alone (repo-root confinement only) would happily read
 * and return it to anyone holding the weaker human token. This is the
 * full-path check for an endpoint that receives a complete path directly.
 */
export function isUnderStateDir(repoRoot: string, stateDirName: string, relPath: string): boolean {
  const stateRoot = path.resolve(repoRoot, stateDirName);
  const resolved = path.resolve(repoRoot, relPath);
  return resolved === stateRoot || resolved.startsWith(stateRoot + path.sep);
}
