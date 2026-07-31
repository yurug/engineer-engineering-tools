// Module: frontier -- the prerequisite-DAG frontier rule, and the mastery
// vocabulary it is stated in.
//
// WHY THIS IS SHARED AND NOT backbrief's: inbrief calls this deliberately
// rather than reimplementing it, and its own call site says why -- "if it
// ever starts deciding anything itself, the two tools can disagree about
// what is teachable while both claiming to follow one rule." Two tools
// asserting one rule is the definition of a shared rule, so it lives here
// rather than being reached for across a product boundary.
//
// It arrived here on 2026-07-29, when `shared` was split: the whole package
// had been extracted as though all of it were shared, and it turned out
// ~8% was. This is one of the pieces that genuinely is.
/** A node's state, as the owning tool spells it. Deliberately a plain
 *  string and NOT a closed union: backbrief's vocabulary has a seventh
 *  state ("contested") this rule says nothing about, and inbrief's is a
 *  different subset again. A state this rule does not name is simply
 *  neither mastered nor eligible, which is the behaviour both tools
 *  already had. Owning the vocabulary would mean owning every tool's
 *  domain, which is the mistake that made this split necessary. */
export type NodeState = string;

/** States a node can be IN and still be offered: not yet held, or held and
 *  since shaken. */
export const FRONTIER_SOURCE_STATES: ReadonlySet<NodeState> = new Set([
  "unseen",
  "introduced",
  "shaky",
  "invalidated",
]);

/** States that SATISFY a prerequisite for something downstream. */
export const MASTERED_STATES: ReadonlySet<NodeState> = new Set([
  "grasped",
  "demonstrated",
]);

/** The minimum a node must expose to be placed in the graph. Structural on
 *  purpose: each tool has its own richer node type, and neither should have
 *  to adopt the other's to ask this question. */
export interface FrontierNode {
  readonly id: string;
  readonly requires: readonly string[];
  /** Ordered ahead of the rest when eligible. */
  readonly threshold?: boolean | undefined;
  /** Retired nodes are never offered, but still satisfy what depends on them. */
  readonly retired?: boolean | undefined;
}

/** The minimum a state record must expose. */
export interface FrontierState {
  readonly nodeId: string;
  readonly state: NodeState;
}

/**
 * @returns ids of the nodes teachable right now: every prerequisite already
 *   mastered, and this node not yet. Threshold nodes come first.
 * @invariant a node absent from `states` counts as `unseen`.
 */
export function computeFrontier(
  nodes: readonly FrontierNode[],
  states: readonly FrontierState[],
): string[] {
  const stateById = new Map(states.map((e) => [e.nodeId, e.state]));
  const stateOf = (id: string): NodeState => stateById.get(id) ?? "unseen";
  const eligible = nodes.filter(
    (n) =>
      !n.retired &&
      n.requires.every((r) => MASTERED_STATES.has(stateOf(r))) &&
      FRONTIER_SOURCE_STATES.has(stateOf(n.id)),
  );
  const threshold = eligible.filter((n) => n.threshold);
  const rest = eligible.filter((n) => !n.threshold);
  return [...threshold, ...rest].map((n) => n.id);
}
