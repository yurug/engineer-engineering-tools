// Module: lib/completion -- NF4's per-card summary derivation (kb/
// properties/non-functional.md#NF4: "summary + records").
import { findDecisionForCard } from "./records";
import type { DecisionMode, Envelope, OptionKey, StoredCard } from "./types";

export interface CardSummary {
  cardId: string;
  prompt: string;
  chosenLabel: string;
  mode: DecisionMode;
  rationale?: string;
}

export function buildCompletionSummary(
  cards: readonly StoredCard[],
  records: readonly Envelope[],
): CardSummary[] {
  return cards.map((card) => {
    const decision = findDecisionForCard(records, card.id);
    const payload = decision?.payload as
      { chosen?: OptionKey; mode?: DecisionMode; rationale?: string } | undefined;
    const chosenOption = payload?.chosen
      ? card.options.find((o) => o.key === payload.chosen)
      : undefined;
    return {
      cardId: card.id,
      prompt: card.prompt,
      chosenLabel: chosenOption?.label ?? "(no record found)",
      mode: payload?.mode ?? "accepted-default",
      ...(payload?.rationale !== undefined ? { rationale: payload.rationale } : {}),
    };
  });
}
