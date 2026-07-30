// Module: lib/change-break -- derives the currently PENDING change-break
// proposal (if any) from the envelope stream, for the Session tab.
//
// pedagogy-engine.md#rupture: `propose_change_break {findingId, plan}` is
// an agent action; `change_break_response {accepted}` is the human's
// answer to it, carrying no findingId of its own (mirrors lib/session-
// status.ts's own "most recent wins" reasoning, and shared/rupture.ts's
// `checkPauseAuthorized` server-side PER-PROPOSAL ATTRIBUTION rule for the
// same gap: a response answers whichever proposal was open at the time).
// Scanning newest-first: the first `change_break_response` we hit means the
// most recent proposal (whichever it was) is already answered, so nothing
// is pending; the first `propose_change_break` we hit (with no intervening
// response) IS the pending one.
import type { Envelope } from "@backbrief/shared/browser";

export interface PendingChangeBreak {
  proposalEnvelopeId: string;
  findingId: string;
  plan: string;
}

interface ProposeChangeBreakPayload {
  findingId: string;
  plan: string;
}

export function findPendingChangeBreak(envelopes: readonly Envelope[]): PendingChangeBreak | null {
  for (let i = envelopes.length - 1; i >= 0; i--) {
    const envelope = envelopes[i]!;
    if (envelope.type === "change_break_response") return null;
    if (envelope.type === "propose_change_break") {
      const payload = envelope.payload as unknown as ProposeChangeBreakPayload;
      return { proposalEnvelopeId: envelope.id, findingId: payload.findingId, plan: payload.plan };
    }
  }
  return null;
}
