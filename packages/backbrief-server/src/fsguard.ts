// Module: fsguard -- backbrief's own instantiation of @brief/core's
// generic state-dir confinement (ADR-001), pinned to ".backbrief".
//
// The actual containment logic now lives in @brief/core, parameterized
// by `stateDirName` (a required argument there -- ADR-001: "each consumer
// states its own"). This file is the ONE place backbrief chooses that
// parameter, so every existing call site in this package (`resolveBackbriefPath`,
// `isUnderBackbrief`) keeps its original signature unchanged.
import { resolveRepoPath, resolveStateDirPath, isUnderStateDir } from "@brief/core";

export { resolveRepoPath };

/** backbrief's one authoritative choice of core's required `stateDirName` parameter. */
const STATE_DIR = ".backbrief";

export function resolveBackbriefPath(repoRoot: string, relPath: string): string {
  return resolveStateDirPath(repoRoot, STATE_DIR, relPath);
}

export function isUnderBackbrief(repoRoot: string, relPath: string): boolean {
  return isUnderStateDir(repoRoot, STATE_DIR, relPath);
}
