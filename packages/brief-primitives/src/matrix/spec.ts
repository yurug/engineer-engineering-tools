// Module: matrix/spec -- MatrixSpec's zod schema (kb/primitives/
// spec.md#4-trade-off-matrix): options x criteria, cells keyed option key
// -> criterion key -> {text, trust?}, an optional `recommended` marker.
//
// Referential integrity mirrors diagram/spec.ts's checkEdgeNodeIds: a cell
// (or `recommended`) naming a key absent from `options`/`criteria` is a
// schema error at ITS OWN path (PR7), not a generic top-level message.
// Missing cells are NOT an error -- kb/primitives/spec.md: "Missing cells
// render as an explicit dash, never as blank." A cell simply absent from
// `cells[optionKey]` is a fully legal spec; only a PRESENT cell naming an
// unknown key is rejected.
//
// Uses "zod/mini", not classic "zod" -- see ../envelope.ts's header for
// why (the bundle-budget finding: this is the one spec schema a DOM-only
// consumer, forebrief's "./matrix" import, actually pays for).
import { z } from "zod/mini";
import { envelopeFields, TrustSchema } from "../envelope.js";

const MatrixOptionSchema = z.strictObject({
  key: z.string().check(z.minLength(1)),
  label: z.string().check(z.minLength(1)),
});
export type MatrixOption = z.infer<typeof MatrixOptionSchema>;

const MatrixCriterionSchema = z.strictObject({
  key: z.string().check(z.minLength(1)),
  label: z.string().check(z.minLength(1)),
});
export type MatrixCriterion = z.infer<typeof MatrixCriterionSchema>;

/** @invariant PR3's per-cell exception (ADR-011) -- `trust` is optional
 *   PER CELL, the one substrate where per-element marking is in scope. */
const MatrixCellSchema = z.strictObject({
  text: z.string().check(z.minLength(1)),
  trust: z.optional(TrustSchema),
});
export type MatrixCell = z.infer<typeof MatrixCellSchema>;

const matrixBodyFields = {
  kind: z.literal("matrix"),
  options: z.array(MatrixOptionSchema).check(z.minLength(1)),
  criteria: z.array(MatrixCriterionSchema).check(z.minLength(1)),
  cells: z.record(z.string(), z.record(z.string(), MatrixCellSchema)),
  recommended: z.optional(z.string().check(z.minLength(1))),
} as const;

interface MatrixBodyLike {
  options: readonly MatrixOption[];
  criteria: readonly MatrixCriterion[];
  cells: Record<string, Record<string, MatrixCell>>;
  recommended?: string | undefined;
}

/**
 * @invariant PR7 -- a cell or `recommended` naming a key `options`/
 *   `criteria` never declared fails at its own `cells[o][c]`/`recommended`
 *   path; a duplicate key among `options` or `criteria` fails at that
 *   array's own path.
 */
function checkMatrixReferences(
  body: MatrixBodyLike,
  ctx: z.core.$RefinementCtx<MatrixBodyLike>,
): void {
  const optionKeys = new Set(body.options.map((o) => o.key));
  const criteriaKeys = new Set(body.criteria.map((c) => c.key));
  if (optionKeys.size !== body.options.length) {
    ctx.addIssue({ code: "custom", message: "duplicate option key", path: ["options"] });
  }
  if (criteriaKeys.size !== body.criteria.length) {
    ctx.addIssue({ code: "custom", message: "duplicate criterion key", path: ["criteria"] });
  }
  for (const [optionKey, row] of Object.entries(body.cells)) {
    if (!optionKeys.has(optionKey)) {
      ctx.addIssue({
        code: "custom",
        message: `cells references unknown option key "${optionKey}"`,
        path: ["cells", optionKey],
      });
    }
    for (const criterionKey of Object.keys(row)) {
      if (!criteriaKeys.has(criterionKey)) {
        ctx.addIssue({
          code: "custom",
          message: `cells references unknown criterion key "${criterionKey}"`,
          path: ["cells", optionKey, criterionKey],
        });
      }
    }
  }
  if (body.recommended !== undefined && !optionKeys.has(body.recommended)) {
    ctx.addIssue({
      code: "custom",
      message: `recommended references unknown option key "${body.recommended}"`,
      path: ["recommended"],
    });
  }
}

/** The matrix BODY: options/criteria/cells/recommended only, no envelope --
 *  same split as diagram/spec.ts's DiagramBodySchema, kept for symmetry
 *  even though no other spec currently embeds a matrix body standalone. */
export const MatrixBodySchema = z
  .strictObject(matrixBodyFields)
  .check(z.superRefine(checkMatrixReferences));
export type MatrixBody = z.infer<typeof MatrixBodySchema>;

/** The full, standalone matrix spec: envelope fields + the body above. */
export const MatrixSpecSchema = z
  .strictObject({ ...envelopeFields, ...matrixBodyFields })
  .check(z.superRefine(checkMatrixReferences));
export type MatrixSpec = z.infer<typeof MatrixSpecSchema>;
