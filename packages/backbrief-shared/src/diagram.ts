// Module: diagram -- DiagramSpec type + zod schema.
//
// Implements kb/spec/data-model.md#diagramspec. Full Mermaid compilation is
// step 3's job (kb/plan.md); step 1 only needs the *shape* to exist so
// `show_diagram` actions parse and so the generic citation walker
// (./citation-walk.ts) finds diagram citations the same way it finds every
// other citation location -- no diagram-specific validation code is written
// here. The one rule enforced at schema level (not deferred to step 3) is
// P1's "every node and edge MUST carry >=1 citation": rejecting an
// uncited element structurally, at parse time, is strictly cheaper than
// building a runtime check later, and the data-model doc states it as a
// hard constraint rather than a step-3 concern.
import { z } from "zod";
import { CitationInputSchema } from "@brief/shared";

const DiagramNodeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  citations: z.array(CitationInputSchema).min(1, "every node needs >=1 citation (P1)"),
});

const DiagramEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  label: z.string().optional(),
  citations: z.array(CitationInputSchema).min(1, "every edge needs >=1 citation (P1)"),
});

const DiagramGroupSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  nodeIds: z.array(z.string().min(1)),
});

/**
 * Step 3 addition: `kb/spec/diagram-compilation.md`'s per-kind table is
 * normative that `sequence` diagrams have no `subgraph`/composite-state
 * equivalent in Mermaid's `sequenceDiagram` DSL -- "NOT supported -- a
 * sequence spec with groups fails schema validation (E_VALIDATION)". Kept
 * as a `.refine()` (not a per-kind discriminated union) because `groups` is
 * the ONLY field that varies by kind here; splitting the whole schema into
 * three variants just to express one conditional field would cost more
 * clarity than it buys.
 */
export const DiagramSpecSchema = z
  .object({
    kind: z.enum(["flow", "sequence", "state"]),
    nodes: z.array(DiagramNodeSchema),
    edges: z.array(DiagramEdgeSchema),
    groups: z.array(DiagramGroupSchema).optional(),
  })
  .refine((spec) => !(spec.kind === "sequence" && spec.groups && spec.groups.length > 0), {
    message: "a sequence diagram cannot have groups (diagram-compilation.md: not supported)",
    path: ["groups"],
  });
export type DiagramSpec = z.infer<typeof DiagramSpecSchema>;
