// Module: fold/support -- read-side helpers for the agent's fold-in
// (kb/architecture/decisions/ADR-005-fold-in-contract.md, kb/spec/
// config-and-formats.md's fold-in output formats). Resolves a card's
// CURRENT state (highest-seq record wins, P5) and reassembles its
// ask_why/ask_context/answer thread from the raw log -- the same log
// `records/queries.ts` already reads for `digest.ts`, reused here rather
// than re-walked.
//
// @invariant P3/P5: NO WRITE PATH IN THIS MODULE, BY CONSTRUCTION -- every
//   export below only READS already-durable state (the decision log, posted
//   round files) and returns plain data for `@forebrief/cli`'s `fold`
//   command to render and hand to the agent for review (ADR-005: "the CLI
//   is a generator, not a writer into kb/"). A write here would be exactly
//   the violation ADR-005 exists to prevent -- if a future change needs
//   one, it belongs in a NEW module, not this one.
import type { Envelope } from "@brief/shared";
import { readEnvelopeLog } from "@brief/core";
import { payloadOf, threadForCard } from "../records/queries";
import { listRoundFiles } from "../rounds/store";
import { resolveForebriefPath } from "../fsguard";
import type { StoredCard, StoredRound } from "../types/round";

const DECISIONS_LOG_RELATIVE_PATH = "decisions.jsonl";

export interface CardFoldState {
  cardId: string;
  /** Every `decision`/`reconciliation` envelope for this card, oldest first
   *  -- the full provenance chain, not just the current state (a folded
   *  file shows every rationale ever recorded for the card, so a later
   *  reconciliation never makes an earlier rationale disappear, P5). */
  history: Envelope[];
  /** The record that governs the card's CURRENT chosen option: the
   *  highest-seq entry of `history` (P5 -- reconciliations only append;
   *  the last one written is authoritative, T8). */
  governing: Envelope | undefined;
  /** True if `governing` is a `reconciliation`, not the original `decision`. */
  reconciled: boolean;
  /** ask_why/ask_context/answer records for this card, in log order --
   *  the thread P7's fold-in reassembles (algorithms.md: "the thread IS
   *  these records -- no snapshot field anywhere"). */
  thread: Envelope[];
}

/** @returns every `decision`/`reconciliation` envelope naming `cardId`, oldest first (the log is already seq-ordered). */
function historyForCard(envelopes: readonly Envelope[], cardId: string): Envelope[] {
  return envelopes.filter(
    (e) =>
      (e.type === "decision" || e.type === "reconciliation") && payloadOf(e)["card"] === cardId,
  );
}

/**
 * @returns this card's full fold-relevant state (history, governing record,
 *   thread) for the CLI's `fold` command to render.
 * @invariant P5: `governing` is the HIGHEST-seq decision/reconciliation --
 *   never resolved by record type or arrival order, only by `seq`.
 */
export function foldStateForCard(envelopes: readonly Envelope[], cardId: string): CardFoldState {
  const history = historyForCard(envelopes, cardId);
  return {
    cardId,
    history,
    governing: history.length === 0 ? undefined : history[history.length - 1],
    reconciled: history.some((e) => e.type === "reconciliation"),
    thread: threadForCard(envelopes, cardId),
  };
}

/** @returns the round whose `id` is `roundId`, or undefined if no such round was ever posted. */
export function findRound(
  rounds: readonly StoredRound[],
  roundId: string,
): StoredRound | undefined {
  return rounds.find((r) => r.id === roundId);
}

/** @returns the round and card for any posted or trickle `cardId`, or undefined if it was never posted. */
export function findCard(
  rounds: readonly StoredRound[],
  cardId: string,
): { round: StoredRound; card: StoredCard } | undefined {
  for (const round of rounds) {
    const card = round.cards.find((c) => c.id === cardId);
    if (card) return { round, card };
  }
  return undefined;
}

/**
 * @returns every envelope in `.forebrief/decisions.jsonl` and every posted
 *   round/trickle file -- the two on-disk sources fold-in reads
 *   (config-and-formats.md's `.forebrief/` layout).
 * @invariant a READ-ONLY replay (`readEnvelopeLog`, not `EventStore.open`):
 *   fold-in must work with no live session (the common case is folding
 *   AFTER `forebrief stop`), so it never takes the writer's file handle or
 *   write queue -- calling this while `serve` also holds the log is safe
 *   precisely because neither side takes a lock.
 */
export async function loadFoldSources(
  repoRoot: string,
): Promise<{ envelopes: Envelope[]; rounds: StoredRound[] }> {
  const logPath = resolveForebriefPath(repoRoot, DECISIONS_LOG_RELATIVE_PATH);
  const [envelopes, rounds] = await Promise.all([
    readEnvelopeLog(logPath),
    listRoundFiles(repoRoot),
  ]);
  return { envelopes, rounds };
}
