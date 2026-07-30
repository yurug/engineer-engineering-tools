// Module: lib/records -- pure, read-only queries over the raw envelope log
// GET /api/state returns (`records`, untouched -- kb/spec/algorithms.md's
// re-validation triggers note: "Raw log reads... return stored envelopes
// untouched -- they are the record, not a rendering"). Mirrors
// @forebrief/server's own records/queries.ts and digest.ts's
// `openProvisionalsSection`: structural derivation over already-fetched
// records, never a grounding computation (ADR-002's boundary is about
// citation VERDICTS, not "does a decision record exist for this card").
import type { Envelope } from "./types";

function payloadOf(envelope: Envelope): Record<string, unknown> {
  return envelope.payload;
}

/** A payload field is always a string/number/undefined by construction
 *  (kb/spec/data-model.md's record payloads) -- narrowing explicitly
 *  (rather than a bare `String(unknown)`) is what makes rendering it safe
 *  from `@typescript-eslint/no-base-to-string`'s own perspective too:
 *  `unknown` could in principle be an object whose `toString()` is
 *  useless. Shared by every component that describes a raw record
 *  (AskThread, CompletionScreen). */
export function payloadField(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

export function ofType(envelopes: readonly Envelope[], type: string): Envelope[] {
  return envelopes.filter((e) => e.type === type);
}

export function findDecisionForCard(
  envelopes: readonly Envelope[],
  cardId: string,
): Envelope | undefined {
  return envelopes.find((e) => e.type === "decision" && payloadOf(e)["card"] === cardId);
}

export function isCardDecided(envelopes: readonly Envelope[], cardId: string): boolean {
  return findDecisionForCard(envelopes, cardId) !== undefined;
}

export function reconciliationsForCard(envelopes: readonly Envelope[], cardId: string): Envelope[] {
  return envelopes.filter((e) => e.type === "reconciliation" && payloadOf(e)["card"] === cardId);
}

/** The ask_why/ask_context/answer/counter_proposal thread for one card, in
 *  log order -- fold-in reassembles it the same way server-side (P7).
 *  Counter-proposals belong here (2026-07-27): the human needs to SEE that
 *  what they typed was recorded, since the field clears on commit and the
 *  card deliberately stays open. */
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

/** Combines the GET /api/state snapshot with whatever the WS has delivered
 *  since, deduped by `seq` (P5: seq is the one stable identity a record
 *  has) and kept in log order -- a reconnect that replays from `since`
 *  (lib/ws-url.ts) can legitimately re-deliver an envelope already in the
 *  snapshot. */
export function mergeEnvelopes(
  snapshot: readonly Envelope[],
  live: readonly Envelope[],
): Envelope[] {
  const bySeq = new Map<number, Envelope>();
  for (const e of snapshot) bySeq.set(e.seq, e);
  for (const e of live) bySeq.set(e.seq, e);
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq);
}

/** Records whose payload names one of `cardIds` -- CompletionScreen's "the
 *  records" (NF4), scoped to the round just finished rather than the
 *  repo's whole history. */
export function recordsForCards(
  envelopes: readonly Envelope[],
  cardIds: readonly string[],
): Envelope[] {
  const ids = new Set(cardIds);
  return envelopes.filter((e) => {
    const card = payloadOf(e)["card"];
    return typeof card === "string" && ids.has(card);
  });
}

export interface OpenProvisional {
  card: string;
  seq: number;
  /** The option key the agent applied (payload `chosen`). */
  chosen: string;
  rationale: string | null;
}

/** @invariant mirrors digest.ts's `openProvisionalsSection` exactly: a
 *   provisional decision with no reconciliation yet -- read-only display
 *   only, this slice (reconciliation UI is a later step's scope). */
export function openProvisionals(envelopes: readonly Envelope[]): OpenProvisional[] {
  return ofType(envelopes, "decision")
    .filter((e) => payloadOf(e)["mode"] === "provisional")
    .filter((e) => {
      const card = payloadOf(e)["card"];
      return typeof card === "string" && reconciliationsForCard(envelopes, card).length === 0;
    })
    .map((e) => ({
      card: String(payloadOf(e)["card"]),
      seq: e.seq,
      chosen: String(payloadOf(e)["chosen"]),
      rationale:
        typeof payloadOf(e)["rationale"] === "string"
          ? (payloadOf(e)["rationale"] as string)
          : null,
    }));
}
