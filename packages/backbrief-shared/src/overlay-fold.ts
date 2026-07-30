// Module: overlay-fold -- the pure fold that rebuilds `overlay.json` from
// the event log, plus the frontier derivation over its result.
//
// Split from ./overlay.ts (shapes) for code-style.md's 200-line budget --
// the logic half of comprehension-map.md's Overlay section, mirroring
// reader-state.ts's split (pure, rebuildable from zero, P6).
import type { Envelope } from "@brief/shared";
// The frontier rule and its state sets live in @brief/shared: inbrief calls
// the same function, so the two tools cannot disagree about what is
// teachable. computeFrontier is re-exported by ./index.ts straight from the
// library rather than through this module -- routing an external package's
// binding through a second CJS re-export is what this package's barrels warn
// about, and it really did resolve to `undefined` in the web bundle.
import { FRONTIER_SOURCE_STATES } from "@brief/shared";
import type { OverlayEntry, MasteryState, EvidenceKind, NodeResponsePayload } from "./overlay";
import type { MapNode } from "./comprehension-map";

interface PresentMovePayload {
  nodeId: string;
}
interface MoveResponsePayload {
  moveId: string;
  kind: string;
  text?: string;
}
interface NodesInvalidatedPayload {
  nodeIds: string[];
}


/**
 * @param envelopes the full cross-session stream, in order (present_move
 *   ACTIONS and their later move_response/node_response/nodes_invalidated
 *   EVENTS interleaved as they happened -- the caller orders, this trusts it)
 * @returns one OverlayEntry per node the log ever touched (untouched nodes
 *   have NO entry -- a missing entry means the implicit "unseen" default)
 * @invariant P11 grasped/demonstrated only from move_response/node_response
 *   (human-token events, gated upstream in api/events.ts); invalidated only
 *   from nodes_invalidated (system-only); every transition APPENDS evidence
 * @invariant P6 pure, rebuildable from zero
 */
export function foldOverlay(envelopes: readonly Envelope[]): OverlayEntry[] {
  const overlay = new Map<string, OverlayEntry>();
  const moveIdToNodeId = new Map<string, string>();
  const entryOf = (nodeId: string, ts: string): OverlayEntry => {
    const existing = overlay.get(nodeId);
    if (existing) return existing;
    const fresh: OverlayEntry = { nodeId, state: "unseen", evidence: [], updatedAt: ts };
    overlay.set(nodeId, fresh);
    return fresh;
  };

  for (const envelope of envelopes) {
    if (envelope.type === "present_move") {
      applyPresentMove(overlay, moveIdToNodeId, envelope);
    } else if (envelope.type === "node_response") {
      applyNodeResponse(entryOf, envelope);
    } else if (envelope.type === "move_response") {
      applyMoveResponse(entryOf, moveIdToNodeId, envelope);
    } else if (envelope.type === "nodes_invalidated") {
      applyInvalidation(entryOf, envelope);
    }
  }
  return [...overlay.values()];
}

function applyPresentMove(
  overlay: Map<string, OverlayEntry>,
  moveIdToNodeId: Map<string, string>,
  envelope: Envelope,
): void {
  const { nodeId } = envelope.payload as unknown as PresentMovePayload;
  moveIdToNodeId.set(envelope.id, nodeId);
  const existing = overlay.get(nodeId);
  // P11 defensive guard: the agent may only ever present a FRONTIER node
  // (pedagogy-engine.md Rule 1); a present_move naming a node already past
  // the frontier (grasped/demonstrated/contested) is a protocol violation
  // upstream and must not silently regress it here.
  if (existing && !FRONTIER_SOURCE_STATES.has(existing.state)) return;
  overlay.set(nodeId, {
    nodeId,
    state: "introduced",
    evidence: existing?.evidence ?? [],
    updatedAt: envelope.ts,
    ...(existing?.refinedAnswer !== undefined ? { refinedAnswer: existing.refinedAnswer } : {}),
  });
}

function applyNodeResponse(
  entryOf: (nodeId: string, ts: string) => OverlayEntry,
  envelope: Envelope,
): void {
  const payload = envelope.payload as unknown as NodeResponsePayload;
  const entry = entryOf(payload.nodeId, envelope.ts);
  if (payload.response === "confirm") {
    const demonstrated = payload.evidenceKind === "prediction";
    pushEvidence(entry, envelope.ts, demonstrated ? "prediction" : "self-report", payload.reason);
    entry.state = demonstrated ? "demonstrated" : "grasped";
  } else if (payload.response === "refine") {
    pushEvidence(entry, envelope.ts, "refinement", payload.refinedAnswer);
    entry.state = "grasped";
    if (payload.refinedAnswer !== undefined) entry.refinedAnswer = payload.refinedAnswer;
  } else if (payload.response === "contest") {
    pushEvidence(entry, envelope.ts, "contest", payload.reason);
    entry.state = "contested";
  } else {
    // "override" -- any state, human-only (comprehension-map.md: "Any state is human-overridable").
    pushEvidence(entry, envelope.ts, "user-override", payload.reason);
    if (payload.overrideState) entry.state = payload.overrideState;
  }
  entry.updatedAt = envelope.ts;
}

function applyMoveResponse(
  entryOf: (nodeId: string, ts: string) => OverlayEntry,
  moveIdToNodeId: ReadonlyMap<string, string>,
  envelope: Envelope,
): void {
  const payload = envelope.payload as unknown as MoveResponsePayload;
  const nodeId = moveIdToNodeId.get(payload.moveId);
  if (!nodeId) return; // moveId not resolvable (stray/replayed-out-of-order input) -- no target to update
  const asState: Record<string, { state: MasteryState; kind: EvidenceKind } | undefined> = {
    "got-it": { state: "grasped", kind: "self-report" },
    "not-clear": { state: "shaky", kind: "self-report" },
    "thats-wrong": { state: "contested", kind: "contest" },
  };
  const effect = asState[payload.kind];
  // "answer" (awaits an agent verdict + a later node_response confirm),
  // "show-evidence" (explicitly "no state change", pedagogy-engine.md), and
  // "step"/"stall" (device telemetry) all leave the overlay untouched.
  if (!effect) return;
  const entry = entryOf(nodeId, envelope.ts);
  pushEvidence(entry, envelope.ts, effect.kind, payload.text, payload.moveId);
  entry.state = effect.state;
  entry.updatedAt = envelope.ts;
}

function applyInvalidation(
  entryOf: (nodeId: string, ts: string) => OverlayEntry,
  envelope: Envelope,
): void {
  const { nodeIds } = envelope.payload as unknown as NodesInvalidatedPayload;
  for (const nodeId of nodeIds) {
    const entry = entryOf(nodeId, envelope.ts);
    // P11: "human evidence is never overwritten -- invalidation appends."
    pushEvidence(entry, envelope.ts, "staleness");
    entry.state = "invalidated";
    entry.updatedAt = envelope.ts;
  }
}

function pushEvidence(
  entry: OverlayEntry,
  ts: string,
  kind: EvidenceKind,
  verbatim?: string,
  moveId?: string,
): void {
  entry.evidence.push({
    ts,
    kind,
    ...(moveId !== undefined ? { moveId } : {}),
    ...(verbatim !== undefined ? { verbatim } : {}),
  });
}

/**
 * @returns node ids on the frontier, threshold nodes first (pedagogy-
 *   engine.md's Sequencing rule 1) -- frontier is a SET by definition
 *   (comprehension-map.md); this ordering is an adopted convenience for
 *   callers that want the agenda directly (step-1 report)
 * @invariant comprehension-map.md#frontier: every `requires` dep is
 *   grasped|demonstrated AND the node's own state is
 *   unseen|introduced|shaky|invalidated; retired nodes are excluded
 */
