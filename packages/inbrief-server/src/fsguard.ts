// Module: fsguard -- inbrief's instantiation of core's state-dir confinement,
// pinned to ".inbrief".
//
// P4 says inbrief writes only under `.inbrief/`, plus `~/.laconic/` through
// laconic's tool and the record shared with backbrief (ADR-009). This module is
// the one place the first of those is made mechanical, and it is the only place
// this package chooses the directory name. Core takes `stateDirName` as a
// required parameter precisely so each consumer states its own.
//
// @invariant P4 -- no write in this package resolves outside `.inbrief/`.
import { resolveStateDirPath, isUnderStateDir, resolveRepoPath } from "@brief/core";

export { resolveRepoPath };

const STATE_DIR = ".inbrief";

/**
 * @param repoRoot absolute path to the project being taught
 * @param relPath path to confine, relative to `.inbrief/`
 * @returns the absolute resolved path, guaranteed inside `.inbrief/`
 * @throws {AppError} core's E_INTERNAL if `relPath` would escape
 */
export function resolveInbriefPath(repoRoot: string, relPath: string): string {
  return resolveStateDirPath(repoRoot, STATE_DIR, relPath);
}

/** @returns whether `relPath` names something inside `.inbrief/`; a citation target never should. */
export function isUnderInbrief(repoRoot: string, relPath: string): boolean {
  return isUnderStateDir(repoRoot, STATE_DIR, relPath);
}
