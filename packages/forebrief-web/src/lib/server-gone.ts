// Module: lib/server-gone -- T2's detection half (kb/properties/edge-
// cases.md#T2: "detects server-gone, shows a banner...").
//
// Combines BOTH signals the spec names: a WS drop (lib/use-forebrief-
// socket.ts's `connected`) triggers an IMMEDIATE reachability check rather
// than waiting for the next poll tick, but only an actual failed
// `GET /api/state` ever flips `gone` -- a WS drop alone is routine churn
// (a backgrounded tab, the hub's own reconnect backoff) and must never by
// itself show the banner.
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchState, type ApiConfig } from "./api";

const POLL_INTERVAL_MS = 3_000;

export interface ServerGoneState {
  gone: boolean;
  /** Increments each time `gone` flips true -> false. Callers (App.tsx's
   *  buffer-replay effect) key off THIS, not off `gone` itself, so a
   *  reconnect replay fires exactly once per recovery rather than on every
   *  render where `gone` already reads false. */
  recoveredTick: number;
}

export function useServerGone(api: ApiConfig, wsConnected: boolean): ServerGoneState {
  const [gone, setGone] = useState(false);
  const [recoveredTick, setRecoveredTick] = useState(0);
  const wasGoneRef = useRef(false);

  const poll = useCallback(async (): Promise<void> => {
    try {
      await fetchState(api);
      if (wasGoneRef.current) setRecoveredTick((tick) => tick + 1);
      wasGoneRef.current = false;
      setGone(false);
    } catch {
      wasGoneRef.current = true;
      setGone(true);
    }
  }, [api.httpOrigin, api.humanToken]);

  useEffect(() => {
    void poll();
    const timer = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [poll]);

  useEffect(() => {
    if (!wsConnected) void poll();
  }, [wsConnected, poll]);

  return { gone, recoveredTick };
}
