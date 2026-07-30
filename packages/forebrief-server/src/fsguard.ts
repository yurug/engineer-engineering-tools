// Module: fsguard -- forebrief's own instantiation of @brief/core's
// generic state-dir confinement (ADR-001), pinned to ".forebrief".
//
// Implements P3 (kb/properties/functional.md): "The server writes only
// under `.forebrief/`." `stateDirName` is a REQUIRED parameter of core's
// primitives (no default -- ADR-001, "each consumer states its own"); this
// is the one place forebrief makes that choice, so every caller in this
// package uses the plain, pre-parameterization call shape.
// @invariant P3 no write in this package resolves outside `.forebrief/`
//
// Phase-5 audit finding (deflated CRITICAL -> cheap fix, "E_FS_BOUNDARY is
// never thrown"): core's `resolveStateDirPath` throws its OWN generic
// `E_INTERNAL` on a boundary violation (it has no notion of forebrief's
// closed error-code union) -- kb/spec/error-taxonomy.md's `E_FS_BOUNDARY`
// row and P3's test strategy both name a code that, before this fix, could
// never actually surface. This is forebrief's own translation, at its one
// wiring point.
import { AppError } from "@brief/shared";
import { resolveRepoPath, resolveStateDirPath, isUnderStateDir } from "@brief/core";

export { resolveRepoPath };

const STATE_DIR = ".forebrief";

/**
 * @param repoRoot absolute path to the host repo
 * @param relPath the path to confine, relative to `.forebrief/`
 * @returns the absolute, resolved path -- guaranteed inside `.forebrief/`
 * @throws {AppError} E_FS_BOUNDARY if `relPath` would escape `.forebrief/`
 *   (core's own `E_INTERNAL` is caught and re-thrown under forebrief's
 *   closed error-code union, naming the offending path)
 * @invariant P3 the only write-path chokepoint this package's stores use
 */
export function resolveForebriefPath(repoRoot: string, relPath: string): string {
  try {
    return resolveStateDirPath(repoRoot, STATE_DIR, relPath);
  } catch (error) {
    if (error instanceof AppError && error.code === "E_INTERNAL") {
      throw new AppError("E_FS_BOUNDARY", `refusing to write outside ${STATE_DIR}/: ${relPath}`, {
        path: relPath,
      });
    }
    throw error;
  }
}

/** @invariant P3 corollary -- `.forebrief/` is never a legitimate read/citation target from outside itself. */
export function isUnderForebrief(repoRoot: string, relPath: string): boolean {
  return isUnderStateDir(repoRoot, STATE_DIR, relPath);
}
