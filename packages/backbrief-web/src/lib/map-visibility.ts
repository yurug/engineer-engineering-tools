// Module: lib/map-visibility -- the LOD (level-of-detail) collapse rule and
// the `requires`-edge remap that follows from it, shared by lib/map-layout
// (the dagre call) and its `structuralKey` memo guard.
//
// Split out of map-layout.ts to keep both files under kb/conventions/
// code-style.md's 200-line/30-line budgets -- this file has zero
// dependency on @dagrejs/dagre (pure data transforms only), matching
// code-style.md's "pure logic lives in shared/pure modules" spirit even
// though this particular pure logic is web-specific (it depends on
// MapNode/MasteryState's browser-safe types, not on any DOM/dagre API).
// Implements kb/spec/comprehension-map.md's LOD rule: "regions whose nodes
// are all grasped/demonstrated collapse into their parent with a count,
// expand on click."
import type { MapNode, MasteryState } from "@backbrief/shared/browser";

const MASTERED: ReadonlySet<MasteryState> = new Set(["grasped", "demonstrated"]);

export interface VisibleEdge {
  from: string;
  to: string;
}
export interface Visibility {
  /** Every live node id -> the id it currently renders AS (itself, or its collapsed region's parent id). */
  renderAs: Map<string, string>;
  /** Parent id -> mastered-child count, for parents currently collapsed. */
  collapsedRegions: Map<string, number>;
}

/**
 * @invariant a parent collapses ONLY when EVERY direct `partOf` child is
 *   grasped|demonstrated -- one non-mastered child keeps the whole region
 *   expanded (there is nothing honest to hide behind a "done" count)
 */
export function computeVisibility(
  live: readonly MapNode[],
  stateOf: (id: string) => MasteryState,
  expandedRegions: ReadonlySet<string>,
): Visibility {
  const childrenByParent = new Map<string, MapNode[]>();
  for (const n of live) {
    if (!n.partOf) continue;
    const list = childrenByParent.get(n.partOf) ?? [];
    list.push(n);
    childrenByParent.set(n.partOf, list);
  }
  const renderAs = new Map<string, string>(live.map((n) => [n.id, n.id]));
  const collapsedRegions = new Map<string, number>();
  for (const [parentId, children] of childrenByParent) {
    if (expandedRegions.has(parentId)) continue; // user expanded -- show real children
    if (!children.every((c) => MASTERED.has(stateOf(c.id)))) continue;
    collapsedRegions.set(parentId, children.length);
    for (const c of children) renderAs.set(c.id, parentId);
  }
  return { renderAs, collapsedRegions };
}

/** True if `a`/`b` are a `partOf` parent/child pair AND that parent is
 *  currently expanded -- the ONLY shape lib/map-layout.ts ever calls
 *  dagre's `setParent` for, so this check (needing no live dagre graph) is
 *  equivalent to `g.parent(a) === b`. Guards dagre's documented
 *  child->ancestor `requires`-edge crash (kb/external/dagre-layout.md's
 *  Failure modes) by simply refusing to draw that edge -- a rare, silent-
 *  but-documented display simplification; the underlying `requires`
 *  relationship in map.json is untouched, only this one line isn't drawn. */
function isParentChildAcrossExpanded(
  byId: ReadonlyMap<string, MapNode>,
  expandedRegions: ReadonlySet<string>,
  a: string,
  b: string,
): boolean {
  const aParent = byId.get(a)?.partOf;
  const bParent = byId.get(b)?.partOf;
  return (aParent === b && expandedRegions.has(b)) || (bParent === a && expandedRegions.has(a));
}

/** `requires` edges, remapped through `renderAs`, deduped, self-loops and
 *  the ancestor-crash shape dropped -- shared verbatim by `layoutMap`
 *  (draws them) and `structuralKey` (hashes them), so the two can never
 *  disagree about which edges the current LOD view has. */
export function computeEdges(
  live: readonly MapNode[],
  byId: ReadonlyMap<string, MapNode>,
  renderAs: ReadonlyMap<string, string>,
  expandedRegions: ReadonlySet<string>,
): VisibleEdge[] {
  const seen = new Set<string>();
  const edges: VisibleEdge[] = [];
  for (const n of live) {
    for (const reqId of n.requires) {
      const from = renderAs.get(reqId);
      const to = renderAs.get(n.id);
      if (!from || !to || from === to) continue;
      if (isParentChildAcrossExpanded(byId, expandedRegions, from, to)) continue;
      const key = `${from}->${to}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ from, to });
    }
  }
  return edges;
}

/**
 * A stable string capturing everything that should trigger a relayout
 * (kb/external/dagre-layout.md: "only call dagre.layout when the visible
 * neighborhood's node/edge/partOf SET changes") -- deliberately NOT raw
 * overlay. Two calls with equal keys are guaranteed to produce identical
 * dagre input; components/MapView.tsx's `useMemo` is keyed on this, not on
 * the overlay array, which is what makes "layout runs only on structural
 * change" hold.
 */
export function structuralKey(
  nodes: readonly MapNode[],
  stateOf: (id: string) => MasteryState,
  expandedRegions: ReadonlySet<string>,
): string {
  const live = nodes.filter((n) => !n.retired);
  const byId = new Map(live.map((n) => [n.id, n]));
  const { renderAs, collapsedRegions } = computeVisibility(live, stateOf, expandedRegions);
  const edges = computeEdges(live, byId, renderAs, expandedRegions);
  return JSON.stringify({
    v: [...new Set(renderAs.values())].sort(),
    p: live
      .filter((n) => n.partOf && expandedRegions.has(n.partOf))
      .map((n) => `${n.id}<${n.partOf!}`)
      .sort(),
    e: edges.map((e) => `${e.from}->${e.to}`).sort(),
    r: [...collapsedRegions.keys()].sort(),
  });
}
