// Module: lib/citation-view -- pure mapping from a citation's validation
// state to how it renders.
//
// Implements the UI half of kb/spec/algorithms.md#citation-validation's
// rendering rule and P1 ("Failing elements render visibly flagged, never
// silently dropped, never shown as truth"): valid/drifted/broken must be
// visually distinct, not just present in a tooltip. Kept as a pure
// function (no JSX) so it is unit-testable without a DOM (kb/conventions/
// testing-strategy.md's unit level) -- ../components/CitationStrip.tsx
// only consumes this, never re-derives the mapping.
import type { ValidationState } from "@backbrief/shared/browser";

export interface CitationView {
  /** CSS class on the badge -- see src/styles.css's `.citation-*` rules. */
  className: string;
  /** Short, human label shown on the badge itself. */
  label: string;
  /** True for `broken` only -- algorithms.md's rendering rule reserves
   *  "flagged" (dashed, unverified) for broken; `drifted` gets its own
   *  distinct badge, not the flagged treatment (kb/plan.md step 1's
   *  P1-flagged-rendering acceptance criterion is about `broken`). */
  isFlagged: boolean;
}

const VIEWS: Record<ValidationState, CitationView> = {
  valid: { className: "citation-valid", label: "verified", isFlagged: false },
  drifted: { className: "citation-drifted", label: "moved (re-anchored)", isFlagged: false },
  broken: { className: "citation-broken", label: "unverified", isFlagged: true },
};

export function citationView(state: ValidationState): CitationView {
  return VIEWS[state];
}

/** Short "path:startLine-endLine" or "path#anchor" label for the badge text. */
export function citationLocationLabel(
  citation:
    | { kind: "code"; path: string; startLine: number; endLine: number }
    | { kind: "kb"; path: string; anchor: string },
): string {
  return citation.kind === "code"
    ? `${citation.path}:${String(citation.startLine)}-${String(citation.endLine)}`
    : `${citation.path}#${citation.anchor}`;
}
