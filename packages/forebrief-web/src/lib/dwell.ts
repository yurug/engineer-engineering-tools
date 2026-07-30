// Module: lib/dwell -- per-card active-time accounting, pure (no React, no
// real timers) so it's testable with explicit `nowMs` values -- see
// lib/use-dwell.ts for the thin hook that drives this off real clock/
// window events. Mirrors mock/round2-cards.html's tick/stopTick, extended
// with a blur/focus pause so a backgrounded tab never inflates dwell_ms
// (kb/spec/data-model.md: "dwell_ms -- ui only" instrumentation).
export interface DwellState {
  accumulatedMs: Record<string, number>;
  activeCardId: string | null;
  /** null while paused (blurred, or no active card); the clock reading `accumulatedMs` was last flushed from. */
  tickStartMs: number | null;
}

export const INITIAL_DWELL_STATE: DwellState = {
  accumulatedMs: {},
  activeCardId: null,
  tickStartMs: null,
};

/** Flushes elapsed time into `accumulatedMs` and stops the clock -- the shared step every other transition below performs first. */
export function pause(state: DwellState, nowMs: number): DwellState {
  if (state.tickStartMs === null || state.activeCardId === null) {
    return { ...state, tickStartMs: null };
  }
  const elapsed = nowMs - state.tickStartMs;
  const prior = state.accumulatedMs[state.activeCardId] ?? 0;
  return {
    ...state,
    tickStartMs: null,
    accumulatedMs: { ...state.accumulatedMs, [state.activeCardId]: prior + elapsed },
  };
}

/** Resumes the clock for whichever card is already active (a window `focus` after a `blur`). */
export function resume(state: DwellState, nowMs: number): DwellState {
  if (state.activeCardId === null) return state;
  return { ...state, tickStartMs: nowMs };
}

/** Flushes the outgoing card, then starts the clock on `cardId` (or stops entirely if `null`, e.g. the completion screen). */
export function switchCard(state: DwellState, cardId: string | null, nowMs: number): DwellState {
  const flushed = pause(state, nowMs);
  return { ...flushed, activeCardId: cardId, tickStartMs: cardId !== null ? nowMs : null };
}

/** @returns total active ms for `cardId`, including time accrued since the last flush if it is the currently-ticking card. */
export function dwellMs(state: DwellState, cardId: string, nowMs: number): number {
  const base = state.accumulatedMs[cardId] ?? 0;
  if (state.activeCardId === cardId && state.tickStartMs !== null) {
    return base + (nowMs - state.tickStartMs);
  }
  return base;
}

/** Zeroes one card's accumulated time (called after its dwell_ms has been read and posted, so a later re-visit doesn't double-count). */
export function resetDwell(state: DwellState, cardId: string): DwellState {
  const rest = { ...state.accumulatedMs };
  delete rest[cardId];
  return { ...state, accumulatedMs: rest };
}
