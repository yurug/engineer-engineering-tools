// Module: watch/mode-watcher -- polls for the TIME-driven half of
// interaction-mode inference: navigation events idle >= 3 minutes with no
// move/node response since infers `mode_change{exploring}`.
//
// Implements kb/spec/pedagogy-engine.md#interaction-modes. Mirrors watch/
// head-watcher.ts's shape exactly (a poll loop appending a system envelope
// through the same eventStore/projectEnvelope chokepoint) because the
// underlying problem is the same: "did enough wall-clock time pass with
// nothing happening" cannot be observed from an event arriving, only from
// a clock read on a timer. The OTHER half of interaction-mode inference --
// "any move/node response flips back to dialogue" -- is event-driven, not
// time-driven, and lives in server/api/events.ts's postEventsRoute instead
// (checked synchronously right after the response is durable, so it reads
// as instant, NF2); this module never flips back to dialogue itself.
// shared/mode-inference.ts owns the actual decision logic (pure, unit-
// tested there); this file is only the timer + the append.
import type { Clock, Envelope } from "@backbrief/shared";
import { shouldInferExploring } from "@backbrief/shared";
import type { EventStore } from "../store/event-store";

/** Poll cadence -- deliberately much shorter than the 3-minute idle
 *  threshold itself (head-watcher.ts's own 2s default is the same idea:
 *  the tick just needs to be fine-grained enough that the INFERRED
 *  timestamp is close to the true idle-threshold crossing, not that every
 *  tick does meaningful work). */
export const DEFAULT_MODE_WATCH_INTERVAL_MS = 10_000;

export interface ModeWatcherDeps {
  eventStore: EventStore;
  clock: Clock;
  /** Keeps server-side derived stores in sync -- same contract as every other watcher/route (server.ts's `projectEnvelope`). */
  projectEnvelope: (envelope: Envelope) => Promise<void>;
  intervalMs?: number;
}

export interface ModeWatcherHandle {
  stop(): void;
}

/**
 * @invariant idempotent per idle window -- once the appended
 *   `mode_change{exploring}` envelope is folded, `shouldInferExploring`
 *   reads `dialogue -> false` short-circuit (shared/mode-inference.ts) and
 *   stops firing until a fresh navigation + idle window occurs.
 */
export function startModeWatcher(deps: ModeWatcherDeps): ModeWatcherHandle {
  let stopped = false;
  let inFlight = false;

  const poll = async (): Promise<void> => {
    // Mirrors head-watcher.ts's own guard: a slow tick must never overlap
    // with itself, and a stopped watcher must never append after `stop()`.
    if (stopped || inFlight) return;
    inFlight = true;
    try {
      const envelopes = deps.eventStore.readSince(0);
      const nowMs = Date.parse(deps.clock.nowIso());
      if (shouldInferExploring(envelopes, nowMs)) {
        const result = await deps.eventStore.append({
          actor: "system",
          type: "mode_change",
          refs: [],
          payload: { mode: "exploring" },
        });
        await deps.projectEnvelope(result.envelope);
      }
    } finally {
      inFlight = false;
    }
  };

  const timer = setInterval(() => void poll(), deps.intervalMs ?? DEFAULT_MODE_WATCH_INTERVAL_MS);
  return {
    stop: () => {
      stopped = true;
      clearInterval(timer);
    },
  };
}
