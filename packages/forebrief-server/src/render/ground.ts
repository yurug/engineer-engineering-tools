// Module: render/ground -- the P1/P2 rendering-verdict matrix, computed
// here and NOWHERE else (kb/architecture/decisions/ADR-002-grounded-or-
// conjecture.md: "Grounding verdicts are computed in one server module...
// the browser renders verdicts, never computes them").
//
// @invariant P1 nothing renders grounded without a server-validated
//   citation: a consequence with no citation, or one whose citation is
//   "broken", is always `conjecture`.
// @invariant P2 `reversible` is the only class that can ever render
//   grounded, and only with a validated (valid or drift-repaired) undo
//   citation; `costly`/`irreversible` are always `conjecture` regardless of
//   citation state -- a cost/undo forecast is still a prediction.
import type { Citation, ValidationState } from "@brief/shared";
import type { Grounding, ReversibilityClass } from "../types/round";

/**
 * @param citation the minted citation, or undefined if none was submitted
 * @param state this citation's fresh validation result, or undefined if
 *   `citation` is undefined (nothing to validate)
 * @invariant P1: absent-or-failed citation -> conjecture; valid or
 *   drift-repaired -> grounded (drift-repair salvages the render, P10)
 */
export function groundClaim(
  citation: Citation | undefined,
  state: ValidationState | undefined,
): Grounding {
  if (!citation || !state || state === "broken") return { kind: "conjecture" };
  return { kind: "grounded", citation };
}

/**
 * @invariant P2's matrix, exhaustively: `reversible` defers to
 *   {@link groundClaim} on its undo citation; `costly`/`irreversible` never
 *   render grounded, no matter what was submitted (a validated undo on an
 *   `irreversible` option is rejected earlier, at schema parse -- E_SCHEMA,
 *   types/round.ts -- so this function never has to consider that case)
 */
export function groundReversibility(
  reversibilityClass: ReversibilityClass,
  undoCitation: Citation | undefined,
  undoState: ValidationState | undefined,
): Grounding {
  if (reversibilityClass !== "reversible") return { kind: "conjecture" };
  return groundClaim(undoCitation, undoState);
}

/** CLI report status (kb/spec/cli-contract.md) <- core's ValidationState. */
export function reportStatus(state: ValidationState): "valid" | "repaired" | "flagged" {
  if (state === "valid") return "valid";
  if (state === "drifted") return "repaired";
  return "flagged";
}
