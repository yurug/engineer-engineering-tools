// Module: laconic-transitions -- pure detection of the "into demonstrated"
// overlay edge the laconic write-back hook fires on.
//
// Implements kb/spec/laconic-bridge.md's write trigger: "fire once per
// (node, session)... write on the TRANSITION into demonstrated, not on
// every later render." server/src/server.ts calls this once per
// node_response/move_response envelope, comparing the overlay snapshot
// taken immediately before ModelStore.applyLive folds that ONE envelope in
// against the snapshot taken immediately after. Since each such envelope
// can only ever change ONE node's overlay entry (overlay-fold.ts's
// applyNodeResponse/applyMoveResponse update exactly the node the payload
// names), this before/after diff IS the transition, exactly once, with no
// separate "have I already fired for this node" bookkeeping needed: a node
// already `demonstrated` in `before` never appears in the result, so a
// later, unrelated envelope that leaves it demonstrated never re-fires;
// only a NEW arrival at `demonstrated` does. This is also why ModelStore's
// cold-start fold (`open()`, which never calls the hook) cannot spuriously
// fire on historical data: only `applyLive`'s live, incremental path is
// ever diffed.
//
// Pure (no I/O) so it lives in `shared`, per code-style.md ("pure logic
// lives in shared; if a function could be pure, it must be") and is
// directly unit-testable with plain OverlayEntry arrays -- no ModelStore,
// no fs, no subprocess needed to exercise the transition logic itself.
import type { OverlayEntry } from "./overlay";

/**
 * @param before the overlay as it was immediately before one envelope folded in
 * @param after the overlay immediately after
 * @returns node ids whose state is `demonstrated` in `after` but was NOT
 *   `demonstrated` in `before` -- i.e. genuinely just-arrived, not merely
 *   still-demonstrated from an earlier fold
 * @invariant P11: this never OBSERVES how a node became demonstrated, only
 *   THAT it did -- the human-token gating that makes `demonstrated` only
 *   reachable via a human node_response/move_response already happened
 *   upstream in overlay-fold.ts; this function is state-diffing only, so it
 *   cannot itself violate or enforce P11, only report the fact.
 */
export function detectNewlyDemonstrated(
  before: readonly OverlayEntry[],
  after: readonly OverlayEntry[],
): string[] {
  const beforeState = new Map(before.map((e) => [e.nodeId, e.state]));
  return after
    .filter((e) => e.state === "demonstrated" && beforeState.get(e.nodeId) !== "demonstrated")
    .map((e) => e.nodeId);
}
