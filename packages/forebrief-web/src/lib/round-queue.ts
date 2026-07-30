// Module: lib/round-queue -- per-card draft state derivation and the
// round-completion check (NF4: "Completing the last card replaces the card
// view with the completion screen").
import { findDecisionForCard } from "./records";
import type { DecisionMode, Envelope, OptionKey, StoredCard } from "./types";

export interface CardDraft {
  chosen: OptionKey | null;
  mode: DecisionMode | null;
  rationale: string;
  askWhyText: string;
  askContextText: string;
  feedbackText: string;
  /** "None of these options fit; study this instead" (2026-07-27). */
  counterText: string;
  /** T3: this card has already been nudged once -- a second bare commit proceeds. */
  nudged: boolean;
  /** A decision record exists for this card (server-acked OR locally buffered, T2). */
  committed: boolean;
  /** Committed via lib/local-buffer.ts, not yet confirmed by the server. */
  pendingLocal: boolean;
}

export const BLANK_DRAFT: CardDraft = {
  chosen: null,
  mode: null,
  rationale: "",
  askWhyText: "",
  askContextText: "",
  feedbackText: "",
  counterText: "",
  nudged: false,
  committed: false,
  pendingLocal: false,
};

/** A card already decided (any channel, before this page even loaded) seeds
 *  a read-only draft carrying its recorded choice -- never re-offered as if undecided. */
export function initialDraft(card: StoredCard, records: readonly Envelope[]): CardDraft {
  const decision = findDecisionForCard(records, card.id);
  if (!decision) return BLANK_DRAFT;
  const payload = decision.payload as { chosen: OptionKey; mode: DecisionMode; rationale?: string };
  return {
    ...BLANK_DRAFT,
    chosen: payload.chosen,
    mode: payload.mode,
    rationale: payload.rationale ?? "",
    nudged: true,
    committed: true,
  };
}

export function initialDrafts(
  cards: readonly StoredCard[],
  records: readonly Envelope[],
): Record<string, CardDraft> {
  return Object.fromEntries(cards.map((card) => [card.id, initialDraft(card, records)]));
}

/** card-copy.md's "default tagged" rule expressed as the mode derivation: picking the default is never an override. */
export function deriveMode(card: StoredCard, chosen: OptionKey): DecisionMode {
  return chosen === card.default ? "accepted-default" : "override";
}

/** NF4: every card in the round has a commit -- the LAST commit is the one that flips this true. */
export function isRoundComplete(
  cards: readonly StoredCard[],
  drafts: Readonly<Record<string, CardDraft>>,
): boolean {
  return cards.length > 0 && cards.every((card) => drafts[card.id]?.committed === true);
}

export function clampIndex(index: number, length: number): number {
  if (length === 0) return 0;
  return Math.min(length - 1, Math.max(0, index));
}
