// Module: lib/citation-severity -- the ONE "worst citation state wins" rule
// every element-alignment module (diagrams, step-2 devices) composes.
//
// Split out of diagram-validation.ts (which had this logic first) once
// device-validation.ts needed the identical rule for trace frames, state-
// machine states/transitions, and memory cells -- kb/conventions/
// code-style.md's DI/reuse rule: a second call site is the signal to
// extract, not to copy-paste a second `worstOf`.
// @invariant P1 "never hide the worst case" -- an element with ANY broken
//   citation reads as broken overall, even alongside otherwise-valid ones.
import type { ValidationState } from "@backbrief/shared/browser";

const SEVERITY_MOST_SEVERE_FIRST: ValidationState[] = ["broken", "drifted", "valid"];

/** @returns the most severe state present in `states`, or "valid" if the list is empty (an element with zero citations can't occur post-P1-validation, but this never throws on it). */
export function worstOf(states: ValidationState[]): ValidationState {
  for (const candidate of SEVERITY_MOST_SEVERE_FIRST) {
    if (states.includes(candidate)) return candidate;
  }
  return "valid";
}
