// Module: repo-cache -- the per-pass `(rev,path)` git-read memoization that
// makes revalidating many citations against the same historical rev cheap.
//
// Extracted from @backbrief/server (ADR-001). Generic over any
// `CitationRepoAccess`-shaped object (not just backbrief's own concrete
// `RepoAccess`) -- it only ever touches `readAtRev`, so it works unchanged
// for any consumer's content-access implementation.
import type { CitationRepoAccess } from "./content-access";

/**
 * Wraps `repo` so `readAtRev` for a FIXED rev (never `"worktree"`) is
 * memoized for the lifetime of the returned object. A rev-pinned git (or
 * equivalent) object is immutable by definition -- reading it twice in one
 * logical pass always returns identical bytes, so caching costs nothing in
 * freshness and saves a repeat read/spawn. `"worktree"` reads are NEVER
 * memoized -- they delegate straight through unconditionally, because
 * "worktree" means "whatever is on disk right now" and a HEAD-watcher's
 * whole premise depends on that staying true within a pass, not just across
 * them.
 * @param repo the access object to wrap -- every OTHER method (if the
 *   caller's concrete type has more than `readAtRev`) passes through via
 *   the spread below, untouched
 * @returns a FRESH wrapper; callers create exactly one per pass (one
 *   request, one WS client's connection) and let it be garbage-collected
 *   afterward -- no cross-pass cache, no invalidation logic
 */
export function memoizeRevReads<T extends CitationRepoAccess>(repo: T): T {
  const cache = new Map<string, Promise<string | null>>();
  return {
    ...repo,
    readAtRev(rev: string, relPath: string): Promise<string | null> {
      if (rev === "worktree") return repo.readAtRev(rev, relPath);
      const key = `${rev}:${relPath}`;
      const cached = cache.get(key);
      if (cached) return cached;
      const pending = repo.readAtRev(rev, relPath);
      cache.set(key, pending);
      return pending;
    },
  };
}
