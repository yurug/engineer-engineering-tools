// Module: lib/live-clock -- a ticking "now" so a presence-derived label
// re-evaluates on its own, instead of only when new props/data arrive.
//
// Extracted from components/PresenceChip.tsx's own original inline timer
// (2026-07-19, the "awaiting agent" indicator work) -- PresenceChip and
// lib/awaiting-agent.ts's `useAwaitingAgent` now share the SAME ticking
// cadence rather than each running its own independent `setInterval` that
// could drift or be tuned differently by accident (the same motivation as
// lib/presence.ts's extraction: one honest clock, not two).
import { useEffect, useState } from "react";

const DEFAULT_TICK_MS = 5_000;

/**
 * @param intervalMs how often to re-render with a fresh `Date.now()`
 *   (default 5s -- PresenceChip's original cadence: frequent enough that a
 *   60s-old timestamp is noticed within a few seconds of crossing the
 *   away threshold, without being a poll interval of its own -- presence
 *   data itself still only arrives via lib/use-presence.ts's 10s poll or
 *   the WS stream; this hook just re-EVALUATES existing data on time).
 * @returns the current epoch ms, updated every `intervalMs` while mounted
 */
export function useLiveNow(intervalMs: number = DEFAULT_TICK_MS): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}
