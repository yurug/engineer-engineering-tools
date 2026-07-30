// Module: lib/keyboard -- NF3's binding table (kb/properties/non-
// functional.md#NF3), centralized as one pure function so both the real
// document keydown listener (App.tsx) and its tests share exactly one
// source of truth for "which key does what".
//
// NF3: "j/k (navigate), 1-4 (select), a (accept default), o (override), w
// (ask-why), c (ask-context), p (counter-proposal), f (feedback), Enter
// (commit), Ctrl/Cmd+Enter (commit from inside a field), u (undo before
// commit)." `o`/`w`/`c`/`p`/`f` only ever FOCUS their field (mirrors mock/
// round2-cards.html's key handler exactly) -- typing and sending happen
// through the field itself and the shared Enter-to-commit action
// (components/CardView.tsx bundles pending ask/feedback text into the
// same commit), never a separate per-field send key NF3 doesn't list.
//
// `m` (compare view toggle, kb/primitives/implementation-slices.md Step
// 2's forebrief half) was added to this table alongside the visible
// control CompareView's caller renders -- NF3's own "discoverability is
// half the property" note applies here too, so KeyHintBar's hint text
// carries it (components/KeyHintBar.tsx).
import type { OptionKey } from "./types";

export type CardAction =
  | { type: "navigate"; delta: 1 | -1 }
  | { type: "select"; key: OptionKey }
  | { type: "accept-default" }
  | { type: "focus-rationale" }
  | { type: "focus-ask-why" }
  | { type: "focus-ask-context" }
  | { type: "focus-counter" }
  | { type: "focus-feedback" }
  | { type: "commit" }
  | { type: "undo" }
  | { type: "toggle-compare" }
  | { type: "filmstrip-step"; delta: 1 | -1 };

const OPTION_KEYS = new Set<OptionKey>(["1", "2", "3", "4"]);

/** @returns the action for `key`, or `null` for any key NF3 doesn't bind. */
export function resolveKeyAction(key: string): CardAction | null {
  if (key === "j" || key === "ArrowDown") return { type: "navigate", delta: 1 };
  if (key === "k" || key === "ArrowUp") return { type: "navigate", delta: -1 };
  if (OPTION_KEYS.has(key as OptionKey)) return { type: "select", key: key as OptionKey };
  if (key === "a") return { type: "accept-default" };
  if (key === "o") return { type: "focus-rationale" };
  if (key === "w") return { type: "focus-ask-why" };
  if (key === "c") return { type: "focus-ask-context" };
  if (key === "p") return { type: "focus-counter" };
  if (key === "f") return { type: "focus-feedback" };
  if (key === "Enter") return { type: "commit" };
  if (key === "u") return { type: "undo" };
  if (key === "m") return { type: "toggle-compare" };
  // Card-visual round (seq 36/37): steps a filmstrip card's stepper --
  // paired with j/k (card navigation) rather than reusing arrow keys,
  // since ArrowDown/ArrowUp already alias j/k above. A no-op when the
  // current card carries no filmstrip (kb/properties/non-functional.md#NF3).
  if (key === ".") return { type: "filmstrip-step", delta: 1 };
  if (key === ",") return { type: "filmstrip-step", delta: -1 };
  return null;
}

/** The modifier state `resolveFieldKeyAction` needs, narrowed from KeyboardEvent so it stays pure. */
export interface KeyModifiers {
  ctrlKey: boolean;
  metaKey: boolean;
}

/**
 * The binding table that applies while a FIELD has focus, where the table
 * above deliberately does not: a textarea must keep every plain key,
 * Enter included, or it cannot hold a multi-line answer.
 *
 * WHY this exists at all (bug found dogfooding on inbrief, 2026-07-27):
 * plain Enter is the only commit path, and `p` puts focus in the counter
 * textarea, so a human who rejects the option set types their alternative
 * into a field that swallows the only key that would send it. Nothing is
 * lost loudly -- the record simply never reaches the log, and the round
 * still reads as undecided. It stayed invisible until the counter-proposal
 * shipped because every earlier field action (ask-why, ask-context,
 * feedback) rides along on the commit of a DECISION, and deciding means
 * pressing Enter outside the field anyway. The counter-proposal is the
 * first move whose whole point is not deciding, so it is the first one
 * with no second path to the log.
 *
 * Escape-to-blur then Enter also works (ActionPanel wires it) and is
 * unchanged; it is simply not a sequence anyone discovers under pressure.
 *
 * @param key the event's `key`
 * @param mods the event's modifier state; either Ctrl or Cmd qualifies, so
 *   the same binding works on Linux and macOS without branching on platform
 * @returns the action to fire, or null to let the field keep the keystroke
 */
export function resolveFieldKeyAction(key: string, mods: KeyModifiers): CardAction | null {
  if (key === "Enter" && (mods.ctrlKey || mods.metaKey)) return { type: "commit" };
  return null;
}
