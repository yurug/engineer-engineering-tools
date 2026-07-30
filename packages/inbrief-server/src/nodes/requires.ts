// Module: nodes/requires -- checking a node's prerequisites before it enters
// the map.
//
// Two things can be wrong with a `requires` list, and both are rejected at
// WRITE time rather than discovered during a session. The reason is the same for
// both: each produces a node that can never be taught, and an untaught node
// looks exactly like a node the session simply has not reached yet. The engineer
// would see a hole in the map with nothing to explain it.
//
// - A dangling reference waits on something that does not exist, so it waits
//   forever.
// - A cycle makes every node in it wait on another member, so none is ever
//   offered.
//
// @invariant ADR-005 -- ordering is a fringe over a prerequisite graph. The
//   fringe computation itself is backbrief's (`computeFrontier`); this module
//   only guarantees the graph handed to it is one a fringe can move through.
import type { Refusal, StoredNode } from "../types/node";

/** Just enough of a node to check a graph: the id and what it waits on. */
type GraphNode = Pick<StoredNode, "id" | "requires">;

/**
 * @param candidate the node about to be written
 * @param existing every node currently in the map
 * @returns the refusals this node's prerequisites earn, empty when it is fine
 * @invariant `existing` is filtered by the candidate's own id first. A node is
 *   an UPSERT, so re-posting one with changed prerequisites must be checked
 *   against the map WITHOUT its previous version; leaving the old entry in
 *   would let a node reach itself through its own stale row and read as a cycle
 *   when nothing is wrong.
 */
export function validateRequires(candidate: GraphNode, existing: readonly GraphNode[]): Refusal[] {
  const refusals: Refusal[] = [];
  const others = existing.filter((n) => n.id !== candidate.id);
  const byId = new Map(others.map((n) => [n.id, n]));

  const dangling = candidate.requires.filter((id) => id !== candidate.id && !byId.has(id));
  if (dangling.length > 0) refusals.push("requires-unknown-node");

  if (createsCycle(candidate, byId)) refusals.push("requires-cycle");
  return refusals;
}

/**
 * @returns whether admitting `candidate` would put it on a cycle
 * @invariant walks the prerequisite edges FORWARD from the candidate: if
 *   following "what must I know first" ever arrives back at the candidate, the
 *   candidate is its own prerequisite. Self-reference is the length-one case and
 *   needs no special handling.
 */
function createsCycle(candidate: GraphNode, byId: ReadonlyMap<string, GraphNode>): boolean {
  const seen = new Set<string>();
  const stack = [...candidate.requires];

  while (stack.length > 0) {
    const id = stack.pop()!;
    if (id === candidate.id) return true;
    if (seen.has(id)) continue; // already explored, and a repeat is not a cycle THROUGH the candidate
    seen.add(id);
    const node = byId.get(id);
    // An unknown id is reported separately as dangling; here it is simply a
    // dead end, so cycle detection does not also blame it.
    if (node) stack.push(...node.requires);
  }
  return false;
}
