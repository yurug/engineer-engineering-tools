// Module: lib/device-validation -- aligns the flat per-citation validation
// array (the WS sidecar, `EnvelopeFrame.validation`) back to each element
// of the THREE step-2 dynamic/composite devices (trace, state-machine,
// memory), the same job lib/diagram-validation.ts does for DiagramSpec.
//
// kb/spec/visual-devices.md's cross-cutting constraint -- "failing elements
// render flagged" -- applies per-frame/per-state/per-transition/per-cell,
// not just once for the whole move (SessionMove.tsx already renders one
// whole-move CitationStrip; this is the FINER-grained per-element flagging
// visual-devices.md#rendering calls for, step 2's job per kb/plan.md).
// Key design decision: the walker's order (shared/citation-walk.ts) is
// PROVEN stable depth-first over the parsed device object's own key order
// (verified empirically against DeviceSpecSchema.parse -- see this
// package's device-validation.test.ts), so -- exactly like
// diagram-validation.ts -- consuming `validation` in the SAME order the
// schema declares each kind's citation-bearing fields is what lets this
// module correlate a flat array back to specific elements with zero
// guessing. Field order per devices.ts:
//   trace:         frames[i].citations, THEN (if present) frames[i].memory.cells[j].citations, for each i in order
//   state-machine:  states[i].citations for each i, THEN transitions[j].citations for each j
//   memory:         cells[i].citations for each i
import type {
  ExecutionTrace,
  MemoryGraph,
  StateMachine,
  ValidationState,
} from "@backbrief/shared/browser";
import type { ValidationEntry } from "./use-backbrief-socket";
import { worstOf } from "./citation-severity";

/** A cursor that consumes leading entries off `validation`, in the walker's stable order -- shared by all three `align*` functions below (module header explains why the order is safe to hand-derive). */
function makeCursor(validation: ValidationEntry[], refsCount: number) {
  let cursor = refsCount;
  return (citationCount: number): ValidationState => {
    const slice = validation.slice(cursor, cursor + citationCount).map((entry) => entry.state);
    cursor += citationCount;
    return worstOf(slice);
  };
}

export interface ExecutionTraceElementStates {
  /** Aligned 1:1 with `spec.frames[]` by index. */
  frameStates: ValidationState[];
  /** Aligned 1:1 with `spec.frames[]`; `undefined` at an index whose frame carries no embedded memory (the sanctioned composite is optional per frame). */
  frameMemoryCellStates: (ValidationState[] | undefined)[];
}

/**
 * @param spec the ExecutionTrace being rendered
 * @param refsCount `envelope.refs.length` -- leading entries in `validation`
 *   that belong to the envelope's top-level refs, not the trace's own frames
 * @param validation the WS sidecar's flat per-citation array (`EnvelopeFrame.validation`)
 * @invariant P1 every frame's WORST citation state wins; an embedded memory
 *   snapshot's cells are aligned independently, at their own nested index
 */
export function alignExecutionTraceValidation(
  spec: ExecutionTrace,
  refsCount: number,
  validation: ValidationEntry[],
): ExecutionTraceElementStates {
  const take = makeCursor(validation, refsCount);
  const frameStates: ValidationState[] = [];
  const frameMemoryCellStates: (ValidationState[] | undefined)[] = [];
  for (const frame of spec.frames) {
    frameStates.push(take(frame.citations.length));
    frameMemoryCellStates.push(
      frame.memory ? frame.memory.cells.map((cell) => take(cell.citations.length)) : undefined,
    );
  }
  return { frameStates, frameMemoryCellStates };
}

export interface StateMachineElementStates {
  /** Keyed by state id (spec-authored, not a synthetic one -- mirrors alignDiagramValidation's nodeStates). */
  stateStates: Map<string, ValidationState>;
  /** Aligned 1:1 with `spec.transitions[]` by index (transitions have no id of their own). */
  transitionStates: ValidationState[];
}

/** @invariant P1 mirrors alignDiagramValidation's node/edge split -- states first (schema field order), then transitions. */
export function alignStateMachineValidation(
  spec: StateMachine,
  refsCount: number,
  validation: ValidationEntry[],
): StateMachineElementStates {
  const take = makeCursor(validation, refsCount);
  const stateStates = new Map<string, ValidationState>();
  for (const state of spec.states) stateStates.set(state.id, take(state.citations.length));
  const transitionStates = spec.transitions.map((transition) => take(transition.citations.length));
  return { stateStates, transitionStates };
}

/** Aligned 1:1 with `spec.cells[]` by index. Reused for BOTH a top-level `memory` device and a trace frame's embedded snapshot (the latter goes through `alignExecutionTraceValidation` instead, at its own nested cursor position -- this standalone function is for when a MemoryGraph is the move's OWN top-level device). */
export function alignMemoryGraphValidation(
  spec: MemoryGraph,
  refsCount: number,
  validation: ValidationEntry[],
): ValidationState[] {
  const take = makeCursor(validation, refsCount);
  return spec.cells.map((cell) => take(cell.citations.length));
}
