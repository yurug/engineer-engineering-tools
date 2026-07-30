// Module: coverage -- server-side glue for GET /api/coverage: walks the
// full worktree (the one endpoint NF3 exempts from laziness), then hands
// the flat file list to shared's pure `buildCoverageMap`.
//
// KB files need no separate walk -- `kb/` (or whatever `config.kbDir`
// names) is just an ordinary subtree of the repo, so one full-tree walk
// already covers code AND KB files together.
import type { RepoAccess } from "./repo";
import type { Config } from "./store/config";
import { isExcluded } from "./excludes";
import { buildCoverageMap, type CoverageMap, type ReaderState } from "@backbrief/shared";

/**
 * @invariant NF3 the ONE endpoint's computation allowed to walk the whole
 *   repo tree (properties/non-functional.md#NF3) -- every other endpoint
 *   stays per-level lazy
 */
export async function listAllFiles(repo: RepoAccess, config: Config, dir = ""): Promise<string[]> {
  const entries = await repo.listWorktreeDir(dir);
  if (entries === null) return [];
  const files: string[] = [];
  for (const entry of entries) {
    if (isExcluded(entry.path, config.excludes)) continue;
    if (entry.kind === "dir") files.push(...(await listAllFiles(repo, config, entry.path)));
    else files.push(entry.path);
  }
  return files;
}

export async function computeCoverage(
  repo: RepoAccess,
  config: Config,
  readerStates: readonly ReaderState[],
): Promise<CoverageMap> {
  const filePaths = await listAllFiles(repo, config);
  return buildCoverageMap(filePaths, readerStates);
}
