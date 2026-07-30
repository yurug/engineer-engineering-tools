// Module: visible-set -- tracks which repo-relative paths are "currently
// visible" in the browser, so HEAD-change revalidation knows where to spend
// its effort.
//
// Implements algorithms.md#head-change-handling's "revalidate citations of
// currently visible content (the *visible set* = paths in each connected
// client's latest `navigation: opened` events; lazy for the rest)". This
// module deliberately tracks a single, UNION-of-all-clients set rather than
// a per-connection map: the spec's own parenthetical ("lazy for the rest")
// only requires that revalidation NOT be O(repo) on every HEAD change, and
// a global "has anyone opened this recently" set already gets that --
// per-client precision would need per-WS-connection state threaded through
// every route, for a benefit (avoiding revalidating a path client A closed
// but client B still has open) this MVP doesn't need. Flagged here so a
// future multi-client precision pass has a named starting point rather than
// silently discovering the simplification.
export interface VisibleSetTracker {
  /** Records that `path` was just opened in some connected browser tab. */
  markOpened(path: string): void;
  /** @returns every path opened at least once since this tracker was created. */
  paths(): ReadonlySet<string>;
}

/** @invariant P8c the union this returns is a conservative OVER-approximation of "visible" -- revalidating a no-longer-open path is wasted work, never a correctness bug (validation is always recomputed fresh anyway, per P1). */
export function createVisibleSetTracker(): VisibleSetTracker {
  const opened = new Set<string>();
  return {
    markOpened: (path: string) => {
      opened.add(path);
    },
    paths: () => opened,
  };
}
