// Module: filmstrip/spec -- FilmstripSpec's zod schema (kb/primitives/
// spec.md#2-filmstrip, ADR-010): one base graph laid out once, steps are
// typed deltas (reveal/conceal/emphasize/dim/relabel) over it -- never a
// structural change.
//
// SPEC GAP FOUND AND RESOLVED HERE (also listed among "unresolved
// ambiguities" in the work's return report, since it's a genuine
// forebrief-shaped decision, not just a KB wording fix -- logged as a
// dogfood decision record): kb/primitives/spec.md's `DiagramSpec.edges`
// has no `id` field, yet a filmstrip step's `show`/`emphasize`/`labels`
// all key by "node/edge id". Resolution: an edge's filmstrip-facing id is
// the synthetic string `${from}->${to}` (`edgeId` below) -- no separate
// `id` field was added to `DiagramEdgeSchema` because `(from, to)` is
// already a unique key within one diagram body (this schema has no
// notion of parallel edges between the same pair).
import { z } from "zod";
import { envelopeFields } from "../envelope.js";
import {
  DiagramBodySchema,
  type DiagramBody,
  type DiagramEdge,
} from "../diagram/spec.js";

/** The filmstrip-facing id for an edge -- see this file's header. */
export function edgeId(edge: Pick<DiagramEdge, "from" | "to">): string {
  return `${edge.from}->${edge.to}`;
}

export const FilmstripStepSchema = z.strictObject({
  /** P-F: every step names what changed, in one sentence. */
  caption: z.string().min(1),
  /** Node/edge ids visible this step; default (omitted): every id in `base`. */
  show: z.array(z.string().min(1)).optional(),
  /** Ids drawn at full weight; the rest dimmed. Omitted/empty: no dimming. */
  emphasize: z.array(z.string().min(1)).optional(),
  /** id -> replacement label text for this step only (ADR-010: values
   *  change, structure does not). */
  labels: z.record(z.string().min(1), z.string().min(1)).optional(),
});
export type FilmstripStep = z.infer<typeof FilmstripStepSchema>;

/** @invariant PR7 -- a step referencing an id absent from `base` fails at
 *   its own `steps[i].show[j]` / `.emphasize[j]` / `.labels.<id>` path. */
function checkStepIdsExistInBase(
  spec: {
    base: Pick<DiagramBody, "nodes" | "edges">;
    steps: readonly FilmstripStep[];
  },
  ctx: z.RefinementCtx,
): void {
  const validIds = new Set<string>([
    ...spec.base.nodes.map((n) => n.id),
    ...spec.base.edges.map(edgeId),
  ]);
  const checkList = (
    ids: readonly string[] | undefined,
    stepIndex: number,
    field: "show" | "emphasize",
  ): void => {
    ids?.forEach((id, idIndex) => {
      if (!validIds.has(id)) {
        ctx.addIssue({
          code: "custom",
          message: `step references id "${id}", not declared in base`,
          path: ["steps", stepIndex, field, idIndex],
        });
      }
    });
  };
  spec.steps.forEach((step, stepIndex) => {
    checkList(step.show, stepIndex, "show");
    checkList(step.emphasize, stepIndex, "emphasize");
    for (const id of Object.keys(step.labels ?? {})) {
      if (!validIds.has(id)) {
        ctx.addIssue({
          code: "custom",
          message: `step references id "${id}", not declared in base`,
          path: ["steps", stepIndex, "labels", id],
        });
      }
    }
  });
}

export const FilmstripSpecSchema = z
  .strictObject({
    ...envelopeFields,
    kind: z.literal("filmstrip"),
    base: DiagramBodySchema,
    steps: z.array(FilmstripStepSchema).min(1),
  })
  .superRefine(checkStepIdsExistInBase);
export type FilmstripSpec = z.infer<typeof FilmstripSpecSchema>;
