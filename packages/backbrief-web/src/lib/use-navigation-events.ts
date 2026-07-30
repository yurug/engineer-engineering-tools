// Module: lib/use-navigation-events -- emits `navigation` events per
// kb/spec/data-model.md#event-payloads: "opened on file open; viewed-region
// after 2s of stable viewport, at most one per (path, region) per minute."
//
// Two distinct emission policies, so this is deliberately two functions,
// not one debounced callback: `opened` is immediate and unconditional
// (fires once per actual file switch); `viewedRegion` is 2s-debounced (only
// the LAST region reported in a 2s idle window is sent) and additionally
// rate-limited per (path,region) key so re-scrolling past the same lines
// repeatedly doesn't flood the event log (P2's fsync-per-event cost is the
// reason the debounce exists at all, per data-model.md's own note).
import { useCallback, useEffect, useRef } from "react";
import { postHumanEvent } from "./browse-api";
import type { ApiConfig } from "./api";

const VIEWED_REGION_DEBOUNCE_MS = 2_000;
const VIEWED_REGION_THROTTLE_MS = 60_000;

export interface NavigationEvents {
  /** Call whenever the currently-open path changes -- de-duplicates repeated calls for the same path itself. */
  reportOpened: (path: string) => void;
  /** Call on every viewport-stable tick; internally debounced + throttled. */
  reportViewedRegion: (path: string, lines: [number, number]) => void;
}

export function useNavigationEvents(api: ApiConfig): NavigationEvents {
  const lastOpenedPath = useRef<string | null>(null);
  const lastRegionEmitAt = useRef<Map<string, number>>(new Map());
  const debounceTimer = useRef<number | undefined>(undefined);

  const reportOpened = useCallback(
    (path: string) => {
      if (lastOpenedPath.current === path) return;
      lastOpenedPath.current = path;
      void postHumanEvent(api, "navigation", { path, kind: "opened" });
    },
    [api],
  );

  const reportViewedRegion = useCallback(
    (path: string, lines: [number, number]) => {
      if (debounceTimer.current !== undefined) window.clearTimeout(debounceTimer.current);
      debounceTimer.current = window.setTimeout(() => {
        const key = `${path}:${String(lines[0])}-${String(lines[1])}`;
        const now = Date.now();
        const lastEmit = lastRegionEmitAt.current.get(key);
        if (lastEmit !== undefined && now - lastEmit < VIEWED_REGION_THROTTLE_MS) return;
        lastRegionEmitAt.current.set(key, now);
        void postHumanEvent(api, "navigation", { path, kind: "viewed-region", lines });
      }, VIEWED_REGION_DEBOUNCE_MS);
    },
    [api],
  );

  useEffect(
    () => () => {
      if (debounceTimer.current !== undefined) window.clearTimeout(debounceTimer.current);
    },
    [],
  );

  return { reportOpened, reportViewedRegion };
}
