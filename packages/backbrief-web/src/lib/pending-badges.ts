// Module: lib/pending-badges -- the Map tab's single combined pending-item
// count.
//
// Implements ADR-005 decision 3 / kb/spec/pedagogy-engine.md's Rule 0:
// "Pending-item counts surface as tab badges, never as Session banners."
// kb/plan.md step 3's scope names three kinds: "queued annotations while
// exploring, nodes_invalidated, spec drift findings." docs/design/
// rethink-mockup-2026-07-18.html's own worked example puts ALL THREE on
// the MAP tab's badge (`mapmeta`: "2 new: a note from your reading, one
// spec drift") rather than splitting them across tabs -- this module
// follows that literal example: Map is the surface a debrief actually
// reacts on (invalidated nodes render there; a contest opens there), so
// everything waiting for the next debrief funnels into one number there.
// Session never gets a badge (Rule 0's whole point) and Code doesn't
// either (annotations are AUTHORED there, but their pending-ness is a
// Map/debrief concept, not a Code one).
import { foldFindings, foldOverlay, type Envelope } from "@backbrief/shared/browser";

interface AnnotationPayload {
  archived?: boolean;
}

/**
 * ADOPTED CLARIFICATION (spec gap, flagged in the step-3 report):
 * pedagogy-engine.md defines "queued annotations" only qualitatively --
 * "react to queued annotations first" on the next debrief -- with no
 * explicit stored "queued" flag anywhere in the protocol. This counts
 * non-archived `annotation` events posted strictly AFTER the most recent
 * `present_move`, which coincides with "posted while exploring" in normal
 * play (the agent does not post a move while exploring, pedagogy-engine.md
 * Rule: "In exploring, the agent MUST NOT post moves") without this module
 * also needing to fold `mode_change` history a second time.
 */
function countQueuedAnnotations(sorted: readonly Envelope[]): number {
  const lastMoveSeq = lastSeqOfType(sorted, "present_move");
  return sorted.filter(
    (e) =>
      e.type === "annotation" &&
      e.seq > lastMoveSeq &&
      !(e.payload as unknown as AnnotationPayload).archived,
  ).length;
}

function lastSeqOfType(sorted: readonly Envelope[], type: string): number {
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i]!.type === type) return sorted[i]!.seq;
  }
  return -1;
}

/**
 * @param envelopes the session's full envelope stream (any order -- sorted internally by `seq`, P6)
 * @returns queued annotations + currently-invalidated map nodes + open findings
 */
export function computeMapBadgeCount(envelopes: readonly Envelope[]): number {
  const sorted = [...envelopes].sort((a, b) => a.seq - b.seq);
  const invalidated = foldOverlay(sorted).filter((e) => e.state === "invalidated").length;
  const openFindings = foldFindings(sorted).filter((f) => f.status === "open").length;
  return countQueuedAnnotations(sorted) + invalidated + openFindings;
}
