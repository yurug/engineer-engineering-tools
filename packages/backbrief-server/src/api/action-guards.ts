// Module: api/action-guards -- the post-validation reject checks
// api/actions.ts runs over a freshly-minted action's citation report.
//
// Split out of api/actions.ts (which grew past code-style.md's 200-line
// budget once the v2 map/device guards landed) -- these three functions
// share one shape (scope `report.results` to ONE payload field's own
// citations, then decide reject-or-not) and one caller, so they belong
// together rather than folded back into the route handler itself.
import { AppError, collectCitationInputs, type CitationInput } from "@backbrief/shared";
import type { ValidationReport } from "../validate/envelope";

/** The shared mint -> validate -> append -> respond pipeline's input shape (mirrors api/actions.ts's `MintableEnvelope`). */
export interface MintableEnvelope {
  type: string;
  payload: object;
  refs: CitationInput[];
  clientKey?: string | undefined;
}

/**
 * C3 (Phase 5 audit): the all-broken check must look ONLY at the diagram
 * SPEC's own node/edge citations -- `report.results` covers the whole
 * envelope (`payload.spec` UNION top-level `refs`, per validate/envelope.ts's
 * "walks refs UNION every citation-typed payload field"), so a show_diagram
 * action with an entirely ungrounded spec but one unrelated valid top-level
 * `ref` used to slip through: `results.every(broken)` was false because of
 * a citation that has nothing to do with the diagram's own elements. This
 * re-collects citations from `payload.spec` alone (the same walker, scoped
 * narrower) and matches them back into `report.results` by object identity
 * -- safe because nothing mutates `parsed` between minting and validating,
 * so a spec citation found here is the EXACT SAME object `validateEnvelope
 * Citations` already produced a result for.
 * @invariant P1 a diagram whose every ELEMENT's citations are broken is
 *   rejected rather than rendered as if it were grounded (ADR-002)
 */
export function rejectIfUngroundedDiagram(
  action: MintableEnvelope,
  report: ValidationReport,
): void {
  if (action.type !== "show_diagram") return;
  const specCitations = new Set(collectCitationInputs((action.payload as { spec: unknown }).spec));
  const specResults = report.results.filter((r) => specCitations.has(r.citation));
  const allBroken = specResults.length > 0 && specResults.every((r) => r.state === "broken");
  if (allBroken) {
    throw new AppError("E_UNGROUNDED_DIAGRAM", "every citation in this diagram is broken", {
      broken: specResults.map((r) => ({ citation: r.citation, reason: r.reason })),
    });
  }
}

/**
 * v2 (visual-devices.md): "all-broken citations -> E_UNGROUNDED_DIAGRAM
 * (same contract as diagrams)" -- `present_move.device` is optional (a
 * pure calibration move carries none, pedagogy-engine.md Rule 1), so this
 * is a no-op unless one is present. Scoped to the device's OWN citations
 * only, same C3 reasoning as `rejectIfUngroundedDiagram` above (an
 * unrelated valid top-level `ref` must not mask an ungrounded device).
 * Round-7: also matches `talk_slide` -- interaction-model.md: "a talk
 * slide is grounded exactly like a move" (same optional `device` field,
 * same all-broken contract, so this check widens rather than forks).
 */
export function rejectIfUngroundedDevice(action: MintableEnvelope, report: ValidationReport): void {
  if (action.type !== "present_move" && action.type !== "talk_slide") return;
  const device = (action.payload as { device?: unknown }).device;
  if (!device) return;
  const deviceCitations = new Set(collectCitationInputs(device));
  const deviceResults = report.results.filter((r) => deviceCitations.has(r.citation));
  const allBroken = deviceResults.length > 0 && deviceResults.every((r) => r.state === "broken");
  if (allBroken) {
    throw new AppError("E_UNGROUNDED_DIAGRAM", "every citation in this device is broken", {
      broken: deviceResults.map((r) => ({ citation: r.citation, reason: r.reason })),
    });
  }
}

/**
 * P13: "every citation must validate at upsert" is a HARD requirement,
 * unlike a card's "post anyway, but flagged" leniency -- a node whose
 * citation is already broken at creation time could never be falsifiable
 * (comprehension-map.md's own rationale for P13), so map_upsert rejects
 * outright rather than accepting-then-flagging. Scoped to the nodes'
 * citations only (not top-level `refs`), same C3 reasoning as the two
 * ungrounded-* checks above.
 */
export function rejectIfAnyMapNodeCitationBroken(
  action: MintableEnvelope,
  report: ValidationReport,
): void {
  const nodeCitations = new Set(
    collectCitationInputs((action.payload as { nodes: unknown }).nodes),
  );
  const nodeResults = report.results.filter((r) => nodeCitations.has(r.citation));
  const invalid = nodeResults.find((r) => r.state !== "valid");
  if (invalid) {
    throw new AppError(
      "E_MAP_VALIDATION",
      `citation does not validate: ${invalid.reason ?? invalid.state}`,
      { citation: invalid.citation, state: invalid.state },
    );
  }
}
