// Module: filmstrip/layout -- builds the ONE base layout every filmstrip
// step derives from (ADR-010: "one base graph laid out once"). Node/edge
// labels in this layout are the WIDEST candidate across base + every step
// (./label-width.ts); ./step-render.ts swaps each id's placeholder text
// back out for the step's real intended text afterward, without ever
// re-running Graphviz -- this single render IS the PR1 guarantee.
import { renderDiagramBody } from "../diagram/render.js";
import type { DiagramBody, DiagramEdge, DiagramNode } from "../diagram/spec.js";
import type { FilmstripStep } from "./spec.js";
import { edgeId } from "./spec.js";
import { pinWidestLabels } from "./label-width.js";

export interface FilmstripLayout {
  /** The one, never-re-laid-out SVG every step's output derives from. */
  pinnedSvg: string;
}

type DiagramBodyLike = Pick<DiagramBody, "meaning" | "nodes" | "edges">;

/** @returns `base` with each node/edge's label replaced by its widest
 *  candidate text -- structure (ids, from/to, style) is untouched. */
function withWidestLabels(
  base: DiagramBodyLike,
  widestTextById: ReadonlyMap<string, string>,
): DiagramBodyLike {
  const nodes: DiagramNode[] = base.nodes.map((node) => ({
    ...node,
    label: widestTextById.get(node.id) ?? node.label,
  }));
  const edges: DiagramEdge[] = base.edges.map((edge) =>
    edge.label
      ? { ...edge, label: widestTextById.get(edgeId(edge)) ?? edge.label }
      : edge,
  );
  return { meaning: base.meaning, nodes, edges };
}

/**
 * @invariant PR9 -- a pure function of `(base, steps)`'s content: calling
 *   this twice with equal arguments renders byte-identical SVG.
 */
export async function buildFilmstripLayout(
  base: DiagramBodyLike,
  steps: readonly FilmstripStep[],
): Promise<FilmstripLayout> {
  const { widestTextById } = await pinWidestLabels(base, steps);
  const layoutBody = withWidestLabels(base, widestTextById);
  const pinnedSvg = await renderDiagramBody(layoutBody);
  return { pinnedSvg };
}
