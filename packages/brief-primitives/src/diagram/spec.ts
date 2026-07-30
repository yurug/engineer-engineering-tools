// Module: diagram/spec -- DiagramSpec's zod schema (kb/primitives/
// spec.md#1-diagram): meaning selects the layout engine (ADR-013), node
// notes render beneath the label and edge labels ride the edge (P-C),
// and an edge naming an unknown node id is a schema error.
//
// KB DRIFT FIXED IN THIS COMMIT: kb/primitives/spec.md's pseudocode types
// FilmstripSpec.base as `DiagramSpec` verbatim, which would nest a SECOND
// envelope (schemaVersion/trust/title) inside every filmstrip's base
// graph. That's redundant -- the outer FilmstripSpec already carries the
// trust/version governing the whole visual (ADR-011: a mixed-trust visual
// takes its weakest claim; there's no rule for what a separate, unused
// `base.trust` would even mean) -- so `base` is typed as `DiagramBody`
// (meaning/nodes/edges only, no envelope) instead. See ./filmstrip/spec.ts
// and the amended block in kb/primitives/spec.md.
import { z } from "zod";
import { envelopeFields } from "../envelope.js";

export const DiagramMeaningSchema = z.enum([
  "flow",
  "state-machine",
  "dependency",
  "concept-map",
  "causal-chain",
]);
export type DiagramMeaning = z.infer<typeof DiagramMeaningSchema>;

const DiagramNodeSchema = z.strictObject({
  id: z.string().min(1),
  label: z.string().min(1),
  /** Renders beneath the node's label (P-C) -- never a step-overridable
   *  field; filmstrip steps only relabel the primary label line
   *  (ADR-010). */
  note: z.string().min(1).optional(),
});
export type DiagramNode = z.infer<typeof DiagramNodeSchema>;

const DiagramEdgeSchema = z.strictObject({
  from: z.string().min(1),
  to: z.string().min(1),
  /** Rides the edge (P-C) -- never a detached legend entry. */
  label: z.string().min(1).optional(),
  style: z.enum(["solid", "dashed"]).optional(),
});
export type DiagramEdge = z.infer<typeof DiagramEdgeSchema>;

const diagramBodyFields = {
  kind: z.literal("diagram"),
  meaning: DiagramMeaningSchema,
  nodes: z.array(DiagramNodeSchema),
  edges: z.array(DiagramEdgeSchema),
} as const;

/**
 * @invariant PR7 -- an edge naming an id absent from `nodes` fails at its
 *   own `edges[i].from`/`edges[i].to` path (spec.md: "Unknown node ids in
 *   edges is a schema error"), not a generic top-level message.
 */
function checkEdgeNodeIds(
  body: { nodes: readonly DiagramNode[]; edges: readonly DiagramEdge[] },
  ctx: z.RefinementCtx,
): void {
  const ids = new Set(body.nodes.map((n) => n.id));
  body.edges.forEach((edge, i) => {
    if (!ids.has(edge.from)) {
      ctx.addIssue({
        code: "custom",
        message: `edge references unknown node id "${edge.from}"`,
        path: ["edges", i, "from"],
      });
    }
    if (!ids.has(edge.to)) {
      ctx.addIssue({
        code: "custom",
        message: `edge references unknown node id "${edge.to}"`,
        path: ["edges", i, "to"],
      });
    }
  });
}

/** The diagram BODY: `meaning`/`nodes`/`edges` only, no envelope. Used
 *  standalone-wrapped below (`DiagramSpecSchema`) and reused verbatim as
 *  `FilmstripSpecSchema`'s `base` field. */
export const DiagramBodySchema = z.strictObject(diagramBodyFields).superRefine(checkEdgeNodeIds);
export type DiagramBody = z.infer<typeof DiagramBodySchema>;

/** The full, standalone diagram spec: envelope fields + the body above. */
export const DiagramSpecSchema = z
  .strictObject({ ...envelopeFields, ...diagramBodyFields })
  .superRefine(checkEdgeNodeIds);
export type DiagramSpec = z.infer<typeof DiagramSpecSchema>;
