// Module: lib/established -- derives "What you've established", the
// brief's first part, from the SAME map/overlay folds the rest of the
// Session tab already reads.
//
// kb/spec/interaction-model.md#the-brief: "Established -- what the human
// holds: demonstrated/grasped map nodes (overlay), shown as terse ✓
// items. Derived, no new protocol." This is exactly that derivation --
// P11's own two human-advanced states, nothing else.
import type { MapNode, MasteryState, OverlayEntry } from "@backbrief/shared/browser";

const ESTABLISHED_STATES: ReadonlySet<MasteryState> = new Set(["grasped", "demonstrated"]);

/**
 * @param nodes the live map, any order
 * @param overlay the live overlay fold, any order
 * @returns the question text of every grasped/demonstrated node, oldest-
 *   established first (`OverlayEntry.updatedAt` order) -- the "nothing
 *   yet" empty-state copy is Brief.tsx's job, not this function's: a pure
 *   fold returns [], the component decides how to render that.
 * @invariant P11 reads ONLY grasped/demonstrated -- never introduced/
 *   shaky/contested/invalidated/unseen, so a node the human has not
 *   actually confirmed can never appear as "established."
 */
export function deriveEstablished(
  nodes: readonly MapNode[],
  overlay: readonly OverlayEntry[],
): string[] {
  const questionById = new Map(nodes.map((n) => [n.id, n.question]));
  return [...overlay]
    .filter((entry) => ESTABLISHED_STATES.has(entry.state))
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
    .map((entry) => questionById.get(entry.nodeId))
    .filter((question): question is string => question !== undefined);
}
