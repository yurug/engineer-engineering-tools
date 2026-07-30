// Module: lib/offer-choices-fold -- finds the latest UNANSWERED
// offer_choices in the envelope stream, for the brief's "Where next" tactics
// (kb/spec/interaction-model.md's choices protocol).
//
// Mirrors lib/change-break.ts's own "scan newest-first, the first response
// found means the latest proposal is already answered" shape, for the
// structurally identical single-outstanding-offer rule shared/choices.ts's
// module header documents (server-side authorization: `checkChoiceMadeScope`
// attributes a `choiceId` to "the single MOST RECENT offer_choices in the
// stream, full stop"). This is the WEB-side mirror of that SAME rule, for
// DISPLAY rather than authorization: once any `choice_made` follows the
// latest `offer_choices`, that offer is answered and "Where next" shows no
// tactics until the agent posts a fresh one -- interaction-model.md's
// governing rule ("the agent posts offer_choices and WAITS... does not
// auto-advance the agenda past a choice point") guarantees there is at
// most one open choice point at a time, so "first choice_made wins" is the
// whole rule, exactly like findPendingChangeBreak's own precedent.
import type { Envelope, OfferChoicesPayload } from "@backbrief/shared/browser";

/**
 * @param envelopes the session's envelope stream, in `seq` order (App.tsx's
 *   own `envelopes` already is -- WS delivery order IS seq order, P6)
 * @returns the most recent `offer_choices` payload if no `choice_made` has
 *   followed it yet; otherwise null (answered, or none ever posted)
 */
export function findLatestOpenOffer(envelopes: readonly Envelope[]): OfferChoicesPayload | null {
  for (let i = envelopes.length - 1; i >= 0; i--) {
    const envelope = envelopes[i]!;
    if (envelope.type === "choice_made") return null;
    if (envelope.type === "offer_choices") {
      return envelope.payload as unknown as OfferChoicesPayload;
    }
  }
  return null;
}
