// Module: lib/use-filmstrip-stepper -- ephemeral per-card UI state for a
// filmstrip card's stepper position (card-visual round, seq 36/37;
// kb/properties/non-functional.md#NF3: "." / "," step a filmstrip forward/
// back, keyboard-reachable).
//
// Deliberately NOT part of CardDraft (lib/round-queue.ts): this is a VIEW
// position through an already server-rendered set of steps, never a
// decision field, and never sent anywhere. It resets on every card change
// (mirrors lib/use-decision-handlers.ts's own nudge-message reset keyed off
// `currentCard?.id`) so revisiting a filmstrip always starts at step 1 --
// no stepper position is worth persisting across a card switch.
//
// This package has no dependency on @brief/primitives (App.tsx's
// header, "nothing renders client-side from a spec") -- stepping is plain
// array-index arithmetic over the STORED `{caption, svg}` steps, the same
// shape @brief/primitives' own createFilmstripStepper takes but
// reimplemented here so the browser bundle never links that package for
// this feature.
import { useEffect, useState } from "react";

export interface FilmstripStepper {
  stepIndex: number;
  step: (delta: 1 | -1) => void;
}

/** @param stepCount 0 when the current card carries no filmstrip -- `step` is then a no-op. */
export function useFilmstripStepper(cardId: string | null, stepCount: number): FilmstripStepper {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => setStepIndex(0), [cardId]);

  const step = (delta: 1 | -1): void => {
    setStepIndex((i) => Math.min(Math.max(i + delta, 0), Math.max(stepCount - 1, 0)));
  };

  return { stepIndex, step };
}
