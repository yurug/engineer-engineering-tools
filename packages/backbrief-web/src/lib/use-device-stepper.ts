// Module: lib/use-device-stepper -- the ONE progression primitive shared by
// the trace and state-machine renderers (kb/spec/visual-devices.md#rendering:
// "the stepper (step / back / reset) is shared by trace and state-machine").
//
// Key design decision: modeled as a HISTORY STACK of opaque positions `T`,
// not a numeric index -- ExecutionTrace's positions are `frames[]` indices
// (linear: exactly one "next"), but StateMachine's positions are visited
// state ids (branching: the user picks WHICH outgoing transition to fire,
// so there is no single deterministic "next"). A history stack expresses
// both uniformly: `advance(next)` pushes wherever the caller decides "next"
// is (a frame index for trace, a transition's `to` id for state-machine),
// `back()` pops, `reset()` clears to the initial position. Every renderer
// still gets genuine step/back/reset semantics and identical P14 telemetry
// -- what differs per kind is only HOW `advance`'s argument gets chosen
// (ExecutionTraceCard offers one "Step" button; StateMachineCard offers one
// button per available outgoing transition), which is exactly the
// difference visual-devices.md's kind-specific `say` shape already implies.
// @invariant P14 "dynamic devices never autoplay" -- `advance`/`back`/
//   `reset` are the ONLY functions that call `setHistory`; the idle-stall
//   effect below calls `onStall` and NOTHING else, so no code path in this
//   module can move `current` without a user calling one of those three
//   functions from a click handler.
import { useEffect, useRef, useState } from "react";

/** Stall fires after this many ms with no advance/back/reset -- pedagogy-engine.md: "stopped mid-device > 60s". */
export const STALL_IDLE_MS = 60_000;

export interface DeviceStepperControls<T> {
  /** The current (top-of-history) position. */
  current: T;
  /** Full visited-position stack, index 0 = the initial position -- exposed for renderers that want a breadcrumb (none do yet; kept for the same reason DiagramElementStates exposes both maps, not just the worst-case one). */
  history: readonly T[];
  /** True once `history.length > 1` -- i.e. the user has advanced at least once past the initial position. */
  atStart: boolean;
  /** Pushes `next` onto history and fires `onStep` -- the device's ONLY forward motion, always user-triggered (a click handler), never a timer. */
  advance: (next: T) => void;
  /** Pops to the previous position; no-op (and no telemetry) at the initial position. */
  back: () => void;
  /** Clears history back to the initial position; no-op (and no telemetry) if already there. */
  reset: () => void;
}

/**
 * @param initial the device's starting position (frame 0 for a trace; the
 *   state machine's own `initial` state id)
 * @param onStep fired on every advance/back/reset that actually changes
 *   position -- the caller wires this to `postMoveResponse(api, moveId,
 *   "step")` (pedagogy-engine.md)
 * @param onStall fired once per idle window when `STALL_IDLE_MS` elapses
 *   while `history.length > 1` (mid-device) -- wired to `postMoveResponse(
 *   api, moveId, "stall")`; this is a DIAGNOSTIC signal only (agent notes:
 *   "the next move should target where they stalled"), never a device mutation
 * @invariant P14 see module header
 */
export function useDeviceStepper<T>({
  initial,
  onStep,
  onStall,
}: {
  initial: T;
  onStep: () => void;
  onStall: () => void;
}): DeviceStepperControls<T> {
  const [history, setHistory] = useState<T[]>([initial]);

  // Latest-callback refs: the idle-stall timer below depends ONLY on
  // `history.length`, never on `onStall`'s identity -- a parent re-render
  // that happens to pass a fresh inline callback must NOT reset the 60s
  // clock (that would be a side channel letting something OTHER than a
  // real user interaction extend the idle window -- not a P14 violation
  // per se, but a correctness bug in the stall signal itself).
  const onStallRef = useRef(onStall);
  onStallRef.current = onStall;

  useEffect(() => {
    if (history.length <= 1) return; // not mid-device yet -- nothing to stall on
    const timer = setTimeout(() => onStallRef.current(), STALL_IDLE_MS);
    return () => clearTimeout(timer);
  }, [history.length]);

  const advance = (next: T): void => {
    setHistory((prev) => [...prev, next]);
    onStep();
  };
  const back = (): void => {
    if (history.length <= 1) return;
    setHistory((prev) => prev.slice(0, -1));
    onStep();
  };
  const reset = (): void => {
    if (history.length <= 1) return;
    setHistory([initial]);
    onStep();
  };

  return {
    // `history` always has >=1 entry (seeded with `[initial]`, never
    // emptied), so this fallback is correctness, not a type-appeasement hack.
    current: history[history.length - 1] ?? initial,
    history,
    atStart: history.length <= 1,
    advance,
    back,
    reset,
  };
}
