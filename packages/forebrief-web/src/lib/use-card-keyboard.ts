// Module: lib/use-card-keyboard -- wires NF3's binding table (lib/keyboard.ts)
// to a single document-level keydown listener, attached once (a ref holds
// the latest callbacks so the listener itself never needs to be re-added
// on every render). While a textarea has focus the main table does not
// apply (mirrors mock/round2-cards.html: typing in a field, including
// Enter for a newline, must never also fire a card-level action) -- only
// `resolveFieldKeyAction`'s one escape hatch does. ActionPanel's own
// Escape-to-blur remains each field's other way back out.
import { useEffect, useRef } from "react";
import { resolveFieldKeyAction, resolveKeyAction } from "./keyboard";
import type { CardAction } from "./keyboard";
import type { OptionKey } from "./types";

export interface CardKeyboardCallbacks {
  navigate: (delta: 1 | -1) => void;
  select: (key: OptionKey) => void;
  acceptDefault: () => void;
  focusRationale: () => void;
  focusAskWhy: () => void;
  focusAskContext: () => void;
  focusCounter: () => void;
  focusFeedback: () => void;
  commit: () => void;
  undo: () => void;
  toggleCompare: () => void;
  /** No-op when the current card carries no filmstrip visual (card-visual round, seq 36/37). */
  stepFilmstrip: (delta: 1 | -1) => void;
}

export function useCardKeyboard(callbacks: CardKeyboardCallbacks): void {
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      // WHY two tables rather than one guarded lookup: a focused field owns
      // its keystrokes, so the question is not "which action does this key
      // mean" but "is this one of the few keys the field does not own".
      const inField = document.activeElement instanceof HTMLTextAreaElement;
      const action: CardAction | null = inField
        ? resolveFieldKeyAction(event.key, event)
        : resolveKeyAction(event.key);
      if (!action) return;
      event.preventDefault();
      const cb = callbacksRef.current;
      switch (action.type) {
        case "navigate":
          cb.navigate(action.delta);
          return;
        case "select":
          cb.select(action.key);
          return;
        case "accept-default":
          cb.acceptDefault();
          return;
        case "focus-rationale":
          cb.focusRationale();
          return;
        case "focus-ask-why":
          cb.focusAskWhy();
          return;
        case "focus-ask-context":
          cb.focusAskContext();
          return;
        case "focus-counter":
          cb.focusCounter();
          return;
        case "focus-feedback":
          cb.focusFeedback();
          return;
        case "commit":
          cb.commit();
          return;
        case "undo":
          cb.undo();
          return;
        case "toggle-compare":
          cb.toggleCompare();
          return;
        case "filmstrip-step":
          cb.stepFilmstrip(action.delta);
          return;
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
}
