// Module: records/queries -- read-only helpers over the decision log,
// shared by the records route (reconciliation.late, P8-adjacent lookups),
// round completion (api/state.ts, rounds/store.ts), and digest.ts.
//
// Pure functions over an already-loaded envelope array (`EventStore.readSince(0)`)
// -- no I/O of their own, so callers control exactly which snapshot they query.
import type { Envelope } from "@brief/shared";

function payloadOf(envelope: Envelope): Record<string, unknown> {
  return envelope.payload as Record<string, unknown>;
}

/** @returns every envelope of one record `type`, in log (seq) order. */
export function ofType(envelopes: readonly Envelope[], type: string): Envelope[] {
  return envelopes.filter((e) => e.type === type);
}

/** @returns the FIRST `decision` envelope for `cardId` -- a card's original decision (round or trickle). */
export function findDecisionForCard(
  envelopes: readonly Envelope[],
  cardId: string,
): Envelope | undefined {
  return envelopes.find((e) => e.type === "decision" && payloadOf(e)["card"] === cardId);
}

/** @invariant a round is complete once every one of its cards has a `decision` record (P5/algorithms.md's round lifecycle). */
export function isCardDecided(envelopes: readonly Envelope[], cardId: string): boolean {
  return findDecisionForCard(envelopes, cardId) !== undefined;
}

/** @returns every `reconciliation` envelope naming `cardId`, in log order (T8: consumers resolve by highest seq -- the last entry here). */
export function reconciliationsForCard(envelopes: readonly Envelope[], cardId: string): Envelope[] {
  return envelopes.filter((e) => e.type === "reconciliation" && payloadOf(e)["card"] === cardId);
}

/** @returns the ask_why/ask_context/answer thread for one card, in log order (fold-in reassembles it the same way, P7). */
export function threadForCard(envelopes: readonly Envelope[], cardId: string): Envelope[] {
  return envelopes.filter(
    (e) =>
      (e.type === "ask_why" ||
        e.type === "ask_context" ||
        e.type === "answer" ||
        e.type === "counter_proposal") &&
      payloadOf(e)["card"] === cardId,
  );
}

/** @returns the most recent `sit_down` envelope, or undefined if none has ever been posted. */
export function latestSitDown(envelopes: readonly Envelope[]): Envelope | undefined {
  return [...envelopes].reverse().find((e) => e.type === "sit_down");
}

export { payloadOf };
