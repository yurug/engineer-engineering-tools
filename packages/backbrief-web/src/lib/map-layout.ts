// Module: lib/map-layout -- the ONE call site for @dagrejs/dagre: turns
// lib/map-visibility.ts's LOD-scoped node/edge set into absolute positions.
//
// Implements kb/external/dagre-layout.md exactly: node width/height set
// BEFORE `dagre.layout()` for every rendered node (real or region);
// `setParent` used only for an expanded region's direct children, keeping
// the compound feature's footprint shallow (that file's Integration-
// constraints section). `layoutMap` calls `dagre.layout` EXACTLY ONCE per
// invocation and has no memoization of its own -- "relayout only on
// structural change" is the CALLER's job (components/MapView.tsx memoizes
// this function's result on `structuralKey`'s output, not on raw overlay).
import dagre, { graphlib } from "@dagrejs/dagre";
import type { EdgeLabel, GraphLabel, NodeLabel as DagreNodeLabel } from "@dagrejs/dagre";
import type { MapNode, MasteryState } from "@backbrief/shared/browser";
import { computeEdges, computeVisibility, type VisibleEdge } from "./map-visibility";

/** `graphlib.Graph`'s three generics default to `any` when left unspecified
 *  (typescript-eslint's `no-unsafe-argument` correctly flags THAT, not
 *  dagre itself) -- pinning them to dagre's own exported label types keeps
 *  `dagre.layout(g)` fully typed end to end. */
type DagreGraph = graphlib.Graph<GraphLabel, DagreNodeLabel, EdgeLabel>;

// kb/plan.md R7-2's readability fix (bundled with ADR-007): a P13 question
// is <=12 words and was truncating mid-sentence inside the old 170x58 box
// (3-line clamp) with no in-graph way to read the rest. Widened + the
// clamp raised to 4 lines (styles.css's `.map-node-label`) -- generous
// enough for a typical 12-word question to fit without opening the node
// card, while dagre's own layout math (map-layout.ts's whole point) still
// only needs a fixed width/height per node, not per-content measurement.
export const NODE_WIDTH = 190;
export const NODE_HEIGHT = 74;
export const REGION_WIDTH = 210;
export const REGION_HEIGHT = 82;

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isRegion: boolean;
  /** Only set for a region node -- the mastered-child count the collapse badge shows. */
  regionCount?: number;
}
export interface LayoutEdge {
  id: string;
  from: string;
  to: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
export interface MapLayout {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  width: number;
  height: number;
}

/** Builds and lays out the dagre graph -- isolated so `layoutMap` itself stays under the 30-line function budget. */
function runDagre(
  visibleIds: readonly string[],
  collapsedRegions: ReadonlyMap<string, number>,
  edgeDefs: readonly VisibleEdge[],
  live: readonly MapNode[],
  expandedRegions: ReadonlySet<string>,
): DagreGraph {
  const g = new graphlib.Graph<GraphLabel, DagreNodeLabel, EdgeLabel>({
    compound: true,
    multigraph: false,
  });
  g.setGraph({ rankdir: "TB", nodesep: 24, ranksep: 56 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const id of visibleIds) {
    const isRegion = collapsedRegions.has(id);
    g.setNode(id, {
      width: isRegion ? REGION_WIDTH : NODE_WIDTH,
      height: isRegion ? REGION_HEIGHT : NODE_HEIGHT,
    });
  }
  for (const n of live) {
    if (n.partOf && expandedRegions.has(n.partOf) && visibleIds.includes(n.id)) {
      g.setParent(n.id, n.partOf);
    }
  }
  for (const e of edgeDefs) g.setEdge(e.from, e.to);
  dagre.layout(g);
  return g;
}

/** Reads dagre's computed positions back into this module's own plain (non-dagre-typed) shape -- isolated so callers never import dagre's own types. */
function extractLayout(
  g: DagreGraph,
  visibleIds: readonly string[],
  collapsedRegions: ReadonlyMap<string, number>,
  edgeDefs: readonly VisibleEdge[],
): MapLayout {
  const layoutNodes: LayoutNode[] = visibleIds.map((id) => {
    // dagre's own NodeLabel type marks x/y optional pre-layout (LayoutNode's
    // fields, node 17-25) -- by construction every id here was `setNode`
    // before `dagre.layout(g)` ran (runDagre's own invariant), so they are
    // always populated by the time this reads them; `?? 0` documents that
    // guarantee instead of silently propagating `undefined` into arithmetic.
    const gn = g.node(id);
    const regionCount = collapsedRegions.get(id);
    return {
      id,
      x: gn.x ?? 0,
      y: gn.y ?? 0,
      width: gn.width,
      height: gn.height,
      isRegion: regionCount !== undefined,
      ...(regionCount !== undefined ? { regionCount } : {}),
    };
  });
  const positionOf = new Map(layoutNodes.map((n) => [n.id, n]));
  const layoutEdges: LayoutEdge[] = edgeDefs.map((e, index) => {
    const a = positionOf.get(e.from)!;
    const b = positionOf.get(e.to)!;
    return {
      id: `${e.from}->${e.to}#${String(index)}`,
      from: e.from,
      to: e.to,
      x1: a.x,
      y1: a.y,
      x2: b.x,
      y2: b.y,
    };
  });
  const graphLabel = g.graph();
  return {
    nodes: layoutNodes,
    edges: layoutEdges,
    width: graphLabel.width ?? 0,
    height: graphLabel.height ?? 0,
  };
}

/**
 * @invariant dagre-layout.md: node width/height are set before `layout()`
 *   for every rendered node; compound `setParent` is used only for an
 *   expanded region's direct children
 */
export function layoutMap(
  nodes: readonly MapNode[],
  stateOf: (id: string) => MasteryState,
  expandedRegions: ReadonlySet<string>,
): MapLayout {
  const live = nodes.filter((n) => !n.retired);
  const byId = new Map(live.map((n) => [n.id, n]));
  const { renderAs, collapsedRegions } = computeVisibility(live, stateOf, expandedRegions);
  const visibleIds = [...new Set(renderAs.values())];
  const edgeDefs = computeEdges(live, byId, renderAs, expandedRegions);
  const g = runDagre(visibleIds, collapsedRegions, edgeDefs, live, expandedRegions);
  return extractLayout(g, visibleIds, collapsedRegions, edgeDefs);
}
