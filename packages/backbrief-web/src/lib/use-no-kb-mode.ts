// Module: lib/use-no-kb-mode -- C1 (Phase 5 audit): the session's no-KB
// flag, for the app-wide notice + hiding KB affordances.
//
// Same one-shot-read shape as lib/use-session-focus.ts's `initialFocus`
// half: `noKbMode` is decided once at `startServer` (server/src/kb-
// access.ts#detectNoKbMode) and never changes for the life of a session, so
// there is nothing to poll or fold from the WS envelope stream -- a single
// GET /api/session at mount is the whole contract.
import { useEffect, useState } from "react";
import { fetchNoKbMode, type ApiConfig } from "./api";

export function useNoKbMode(api: ApiConfig): boolean {
  const [noKbMode, setNoKbMode] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchNoKbMode(api).then((value) => {
      if (!cancelled) setNoKbMode(value);
    });
    return () => {
      cancelled = true;
    };
  }, [api.httpOrigin, api.humanToken]);

  return noKbMode;
}
