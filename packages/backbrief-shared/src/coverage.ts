// Module: coverage -- pure worst-status-wins aggregation of ReaderState over
// a flat file-path universe, per kb/spec/algorithms.md#coverage-map-
// derivation.
//
// The server owns enumerating "the universe of files" (a repo-tree +
// KB-tree walk, real I/O -- server/src/coverage.ts); this module owns the
// aggregation MATH once that list exists, which has no I/O of its own and
// is exactly the kind of algebraic claim kb/conventions/testing-strategy.md
// wants property-tested ("a directory's status is never better than its
// worst descendant"). Kept in `shared` per architecture/overview.md's
// mechanism table ("Reader-state fold, coverage | shared (pure)").
import type { ReaderState, ReaderStatus } from "./reader-state";

/**
 * Priority order for worst-status-wins, MOST severe first -- literally
 * algorithms.md's own ordering: "contested > unseen > questioned > visited
 * > understood". A directory's aggregate is the WORST (lowest index here)
 * status among its children.
 */
export const WORST_STATUS_ORDER: readonly ReaderStatus[] = [
  "contested",
  "unseen",
  "questioned",
  "visited",
  "understood",
];

/** @returns whichever of `a`/`b` is worse per WORST_STATUS_ORDER. */
export function worseStatus(a: ReaderStatus, b: ReaderStatus): ReaderStatus {
  return WORST_STATUS_ORDER.indexOf(a) <= WORST_STATUS_ORDER.indexOf(b) ? a : b;
}

export interface CoverageEntry {
  targetPath: string;
  status: ReaderStatus;
  decayedFrom?: ReaderStatus;
}

export type CoverageCounts = Record<ReaderStatus, number>;

export interface CoverageMap {
  targets: CoverageEntry[];
  counts: CoverageCounts;
}

const ZERO_COUNTS: CoverageCounts = {
  unseen: 0,
  visited: 0,
  questioned: 0,
  understood: 0,
  contested: 0,
};

/**
 * Folds ReaderState over `filePaths` (the full repo+KB file universe,
 * server-supplied) plus any extra touched targets not shaped like a file
 * (property-ID targets, `kb/properties/functional.md#P4`) that `filePaths`
 * cannot contain.
 * @param filePaths every file the coverage map should show, repo-relative,
 *   forward-slash-separated (server's job to exclude `.backbrief`/config
 *   excludes before calling this -- this function trusts the list)
 * @param readerStates the folded reader state (any subset of `filePaths`
 *   may be absent -- those default to "unseen", never omitted from the map)
 * @returns every file AND every directory (aggregated), plus any property-
 *   ID targets, as a flat list -- `counts` totals FILE-level entries only,
 *   so a directory's aggregate is never double-counted against its children
 * @invariant NF3 this is the one endpoint's computation allowed to be
 *   O(repo) (properties/non-functional.md#NF3) -- everything else stays lazy
 */
export function buildCoverageMap(
  filePaths: readonly string[],
  readerStates: readonly ReaderState[],
): CoverageMap {
  const byTarget = new Map(readerStates.map((s) => [s.targetPath, s]));
  const counts: CoverageCounts = { ...ZERO_COUNTS };
  const targets: CoverageEntry[] = [];
  const dirStatus = new Map<string, ReaderStatus>();

  for (const filePath of filePaths) {
    const state = byTarget.get(filePath);
    const status = state?.status ?? "unseen";
    counts[status] += 1;
    targets.push(entryFor(filePath, status, state?.decayedFrom));
    rollUpDirectories(filePath, status, dirStatus);
  }
  for (const [dirPath, status] of dirStatus) targets.push(entryFor(dirPath, status));

  // Property-ID targets (data-model.md's secondary granularity) never
  // appear in `filePaths` -- surface them only if touched, without
  // affecting `counts` (they are not independent file-level units).
  const fileSet = new Set(filePaths);
  for (const state of readerStates) {
    if (!fileSet.has(state.targetPath) && state.targetPath.includes("#")) {
      targets.push(entryFor(state.targetPath, state.status, state.decayedFrom));
    }
  }

  return { targets, counts };
}

function entryFor(
  targetPath: string,
  status: ReaderStatus,
  decayedFrom?: ReaderStatus,
): CoverageEntry {
  return { targetPath, status, ...(decayedFrom !== undefined ? { decayedFrom } : {}) };
}

/** Rolls `status` up into every ancestor directory of `filePath`, worst-status-wins. */
function rollUpDirectories(
  filePath: string,
  status: ReaderStatus,
  dirStatus: Map<string, ReaderStatus>,
): void {
  const segments = filePath.split("/");
  for (let depth = 1; depth < segments.length; depth++) {
    const dirPath = segments.slice(0, depth).join("/");
    const prior = dirStatus.get(dirPath);
    dirStatus.set(dirPath, prior === undefined ? status : worseStatus(prior, status));
  }
}
