// Module: lib/use-dwell -- wires lib/dwell.ts's pure state machine to the
// real clock and window focus/blur events. Deliberately never triggers a
// re-render on its own (dwell_ms is read once, at commit) -- a ref holds
// the state, not `useState`.
import { useEffect, useRef } from "react";
import {
  INITIAL_DWELL_STATE,
  dwellMs,
  pause,
  resetDwell,
  resume,
  switchCard,
  type DwellState,
} from "./dwell";

export interface DwellTracker {
  getDwellMs(cardId: string): number;
  resetDwell(cardId: string): void;
}

export function useDwellTracker(activeCardId: string | null): DwellTracker {
  const stateRef = useRef<DwellState>(INITIAL_DWELL_STATE);

  useEffect(() => {
    stateRef.current = switchCard(stateRef.current, activeCardId, performance.now());
  }, [activeCardId]);

  useEffect(() => {
    const onBlur = (): void => {
      stateRef.current = pause(stateRef.current, performance.now());
    };
    const onFocus = (): void => {
      stateRef.current = resume(stateRef.current, performance.now());
    };
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return {
    getDwellMs: (cardId: string) => dwellMs(stateRef.current, cardId, performance.now()),
    resetDwell: (cardId: string) => {
      stateRef.current = resetDwell(stateRef.current, cardId);
    },
  };
}
