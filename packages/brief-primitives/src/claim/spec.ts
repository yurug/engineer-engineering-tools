// Module: claim/spec -- ClaimSpec's zod schema (kb/primitives/
// spec.md#5-assertion-evidence-card): one asserting sentence, exactly one
// evidence primitive (recursion depth 1), an optional one-line caveat.
//
// PR6, THE CENTRAL DESIGN CONSTRAINT OF THIS FILE: `evidence` validates
// ONLY its own ENVELOPE shape here (`kind`, via the shared, cheap
// `PrimitiveKindSchema` -- no heavier than "."'s own entry already is) --
// NOT its kind-specific body (nodes/edges, options/criteria, x/y, ...).
// Doing THAT here would force this file to import DiagramSpecSchema,
// FilmstripSpecSchema, ChartSpecSchema, AND MatrixSpecSchema, which would
// statically pull Graphviz AND Vega into "./claim"'s own module graph --
// exactly the violation kb/primitives/properties.md#PR6 names for this
// step ("importing './claim' must not eagerly pull every renderer").
// The evidence's BODY is validated lazily, by whichever renderer its
// `kind` maps to, at render time (./dispatch.ts) -- so a malformed
// evidence body is still caught (PR7 holds), one layer later than the
// outer claim's own fields. See test/pr6-claim-entry-isolation.test.ts.
import { z } from "zod";
import { envelopeFields, PrimitiveKindSchema } from "../envelope.js";
import { looksLikeAssertion } from "./assertion-heuristic.js";

/** Evidence's envelope-only shape: `kind` must be recognized; anything
 *  else the evidence spec carries passes through unchecked at this layer
 *  (a loose object, not a strict one -- see this file's header). */
const EvidenceEnvelopeSchema = z.looseObject({
  kind: PrimitiveKindSchema,
});
export type EvidenceEnvelope = z.infer<typeof EvidenceEnvelopeSchema>;

const claimBodyFields = {
  kind: z.literal("claim"),
  assertion: z.string().min(1),
  evidence: EvidenceEnvelopeSchema,
  caveat: z.string().min(1).optional(),
} as const;

interface ClaimBodyLike {
  assertion: string;
  evidence: { kind: string };
}

/** @invariant P-F -- "an assertion headline asserts": `assertion` fails
 *   at its own path when ./assertion-heuristic.ts's checks reject it. */
function checkAssertion(body: ClaimBodyLike, ctx: z.RefinementCtx): void {
  const check = looksLikeAssertion(body.assertion);
  if (!check.ok) {
    ctx.addIssue({
      code: "custom",
      message: check.reason ?? "assertion reads as a topic phrase, not a claim",
      path: ["assertion"],
    });
  }
}

/**
 * @invariant kb/primitives/spec.md's agent note -- "the recursion in
 *   ClaimSpec.evidence is depth-1 on purpose: a claim whose evidence is
 *   another claim is an outline, not a card." Rejected at its own
 *   `evidence.kind` path (PR7).
 */
function checkEvidenceNotClaim(
  body: ClaimBodyLike,
  ctx: z.RefinementCtx,
): void {
  if (body.evidence.kind === "claim") {
    ctx.addIssue({
      code: "custom",
      message:
        "evidence must not itself be a claim (recursion depth 1) -- a claim whose " +
        "evidence is another claim is an outline, not a card",
      path: ["evidence", "kind"],
    });
  }
}

function checkClaimBody(body: ClaimBodyLike, ctx: z.RefinementCtx): void {
  checkAssertion(body, ctx);
  checkEvidenceNotClaim(body, ctx);
}

/** The claim BODY: assertion/evidence/caveat only, no envelope -- same
 *  split as diagram/spec.ts's DiagramBodySchema. */
export const ClaimBodySchema = z
  .strictObject(claimBodyFields)
  .superRefine(checkClaimBody);
export type ClaimBody = z.infer<typeof ClaimBodySchema>;

/** The full, standalone claim spec: envelope fields + the body above. */
export const ClaimSpecSchema = z
  .strictObject({ ...envelopeFields, ...claimBodyFields })
  .superRefine(checkClaimBody);
export type ClaimSpec = z.infer<typeof ClaimSpecSchema>;
