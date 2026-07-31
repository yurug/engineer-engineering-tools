// Module: claim/dispatch -- evidence rendering, LAZILY, by kind (PR6:
// "dispatch lazily by evidence kind"). Each branch dynamically imports
// only the ONE renderer its evidence.kind names -- diagram/filmstrip/
// chart/matrix are otherwise entirely absent from "./claim.js"'s module
// graph (see ./spec.ts's header; test/pr6-claim-entry-isolation.test.ts
// proves this with the same static-graph walker every other PR6 test
// uses -- dynamic `import()` is invisible to it, exactly as it is to
// ./chart/render.ts's vega/vega-lite imports).
import type { ZodIssue } from "zod";
import { PrimitiveSchemaError } from "../schema-error.js";
import type { Trust } from "../envelope.js";
import type { EmbedOptions } from "../trust-frame.js";
import type { EvidenceEnvelope } from "./spec.js";

export interface EvidenceMarkup {
  markup: string;
}

export type EvidenceDispatchResult =
  | { ok: true; value: EvidenceMarkup }
  | { ok: false; error: PrimitiveSchemaError };

/** Re-paths every issue under "evidence." so a claim-level consumer sees
 *  WHERE inside the nested spec a failure is (PR7) -- the evidence's own
 *  schema validates it standalone and has no idea it is nested here. */
export function prefixIssuesWithEvidence(
  issues: readonly ZodIssue[],
): ZodIssue[] {
  return issues.map((issue) => ({
    ...issue,
    path: ["evidence", ...issue.path],
  }));
}

/**
 * Evidence kinds that mark trust PER ELEMENT rather than only on an outer
 * frame. A matrix flags individual cells, so its own frame sits over
 * nuance the claim card's single outer frame cannot reproduce, and it
 * keeps that frame unconditionally. The three SVG kinds carry whole-visual
 * trust and nothing else, so the card's frame says all theirs would.
 */
const KINDS_WITH_PER_ELEMENT_TRUST = new Set<string>(["matrix"]);

/**
 * Whether nested evidence draws its OWN trust chrome.
 *
 * The card's outer frame already states the weakest trust across card and
 * evidence (./render.ts). When the evidence's trust EQUALS that, the inner
 * frame is a second rectangle and a second CONJECTURE tag saying exactly
 * what the outer one says -- P-D deletes an element carrying no
 * information, and a reader was looking at two dashed boxes for one claim.
 *
 * The asymmetry is load-bearing: when the two DIFFER, the inner frame
 * stays. A grounded chart inside a conjecture card renders solid inside
 * dashed, because "this drawing is verified even though the card is not"
 * is true, and the outer frame -- pinned to the weaker level by PR3 --
 * cannot say it.
 *
 * @invariant PR3 -- suppressing chrome never suppresses the `data-trust`
 *   attribute or the provenance stamp (../trust-frame.ts): what is dropped
 *   is a redundant MARK, never the trust CLAIM.
 */
export function evidenceDrawsOwnChrome(
  kind: string,
  evidenceTrust: Trust,
  cardTrust: Trust,
): boolean {
  if (KINDS_WITH_PER_ELEMENT_TRUST.has(kind)) return true;
  return evidenceTrust !== cardTrust;
}

async function dispatchDiagram(
  evidence: unknown,
  embed: EmbedOptions,
): Promise<EvidenceDispatchResult> {
  const { renderDiagram } = await import("../diagram/render.js");
  const outcome = await renderDiagram(evidence, embed);
  if (outcome.status === "invalid") return { ok: false, error: outcome.error };
  return { ok: true, value: { markup: outcome.svg } };
}

/**
 * A claim card is a single static assertion (P-H: "no narrative wrapping
 * on decision surfaces") -- a filmstrip's multi-step narrative doesn't fit
 * one evidence slot, so its FIRST step (the base state) stands in as the
 * representative static image. Embedding the interactive stepper instead
 * is a deferred, richer composition, not required by this slice's spec
 * (documented design choice, kb/primitives/implementation-slices.md Step
 * 3's findings).
 */
async function dispatchFilmstrip(
  evidence: unknown,
  embed: EmbedOptions,
): Promise<EvidenceDispatchResult> {
  const { renderFilmstrip } = await import("../filmstrip/render.js");
  const outcome = await renderFilmstrip(evidence, embed);
  if (outcome.status === "invalid") return { ok: false, error: outcome.error };
  if (outcome.status === "skew")
    return { ok: true, value: { markup: outcome.svg } };
  // FilmstripSpecSchema requires steps.min(1) -- outcome.steps[0] always exists.
  const first = outcome.steps[0];
  return { ok: true, value: { markup: first ? first.svg : "" } };
}

async function dispatchChart(
  evidence: unknown,
  embed: EmbedOptions,
): Promise<EvidenceDispatchResult> {
  const { renderChart } = await import("../chart/render.js");
  const outcome = await renderChart(evidence, embed);
  if (outcome.status === "invalid") return { ok: false, error: outcome.error };
  return { ok: true, value: { markup: outcome.svg } };
}

async function dispatchMatrix(
  evidence: unknown,
): Promise<EvidenceDispatchResult> {
  const { renderMatrix } = await import("../matrix/render.js");
  const outcome = renderMatrix(evidence); // matrix rendering is synchronous (PR6: pure DOM)
  if (outcome.status === "invalid") return { ok: false, error: outcome.error };
  return { ok: true, value: { markup: outcome.html } };
}

/**
 * @invariant PR6 -- each branch's dynamic `import()` is the ONLY path to
 *   that renderer's heavy dependency; a claim whose evidence is a matrix
 *   never touches Graphviz or Vega, and vice versa.
 */
export async function renderEvidence(
  evidence: EvidenceEnvelope,
  embed: EmbedOptions = {},
): Promise<EvidenceDispatchResult> {
  switch (evidence.kind) {
    case "diagram":
      return dispatchDiagram(evidence, embed);
    case "filmstrip":
      return dispatchFilmstrip(evidence, embed);
    case "chart":
      return dispatchChart(evidence, embed);
    case "matrix":
      return dispatchMatrix(evidence);
    case "claim":
      // Unreachable in practice: ClaimSpecSchema's own superRefine
      // (../claim/spec.ts) rejects this before dispatch ever runs.
      // Handled as a Result, not a throw (kb/conventions/
      // error-handling.md: "shared code returns Result -- never throw"),
      // so this stays defensive rather than dead code with no fallback.
      return {
        ok: false,
        error: new PrimitiveSchemaError(
          "unreachable: claim evidence rejected before dispatch",
          [],
        ),
      };
  }
}
