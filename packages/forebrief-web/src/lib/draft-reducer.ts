// Module: lib/draft-reducer -- the one state machine behind every card's
// in-progress decision (App.tsx's `useReducer`). Pure and DOM-free so the
// whole interaction sequence (select -> nudge -> commit) is testable
// without mounting anything.
import { deriveMode, type CardDraft } from "./round-queue";
import type { OptionKey, StoredCard } from "./types";

export type DraftTextField =
  "rationale" | "askWhyText" | "askContextText" | "feedbackText" | "counterText";

export type DraftAction =
  | { type: "seed"; drafts: Record<string, CardDraft> }
  | { type: "select"; card: StoredCard; key: OptionKey }
  | { type: "set-text"; cardId: string; field: DraftTextField; text: string }
  | { type: "mark-nudged"; cardId: string }
  | { type: "undo"; cardId: string }
  | { type: "clear-ask-why"; cardId: string }
  | { type: "clear-ask-context"; cardId: string }
  | { type: "clear-feedback"; cardId: string }
  | { type: "clear-counter"; cardId: string }
  | { type: "commit"; cardId: string; pendingLocal: boolean };

function draftOf(drafts: Record<string, CardDraft>, cardId: string): CardDraft {
  return (
    drafts[cardId] ?? {
      chosen: null,
      mode: null,
      rationale: "",
      askWhyText: "",
      counterText: "",
      askContextText: "",
      feedbackText: "",
      nudged: false,
      committed: false,
      pendingLocal: false,
    }
  );
}

export function draftReducer(
  drafts: Record<string, CardDraft>,
  action: DraftAction,
): Record<string, CardDraft> {
  switch (action.type) {
    case "seed":
      return action.drafts;
    case "select": {
      const current = draftOf(drafts, action.card.id);
      if (current.committed) return drafts; // P5: an already-committed card is read-only
      return {
        ...drafts,
        [action.card.id]: {
          ...current,
          chosen: action.key,
          mode: deriveMode(action.card, action.key),
        },
      };
    }
    case "set-text": {
      const current = draftOf(drafts, action.cardId);
      return { ...drafts, [action.cardId]: { ...current, [action.field]: action.text } };
    }
    case "mark-nudged": {
      const current = draftOf(drafts, action.cardId);
      return { ...drafts, [action.cardId]: { ...current, nudged: true } };
    }
    case "undo": {
      const current = draftOf(drafts, action.cardId);
      if (current.committed) return drafts; // NF3/P5: undo is pre-commit only
      return {
        ...drafts,
        [action.cardId]: { ...current, chosen: null, mode: null, rationale: "", nudged: false },
      };
    }
    case "clear-ask-why": {
      const current = draftOf(drafts, action.cardId);
      return { ...drafts, [action.cardId]: { ...current, askWhyText: "" } };
    }
    case "clear-ask-context": {
      const current = draftOf(drafts, action.cardId);
      return { ...drafts, [action.cardId]: { ...current, askContextText: "" } };
    }
    case "clear-feedback": {
      const current = draftOf(drafts, action.cardId);
      return { ...drafts, [action.cardId]: { ...current, feedbackText: "" } };
    }
    case "clear-counter": {
      const current = draftOf(drafts, action.cardId);
      return { ...drafts, [action.cardId]: { ...current, counterText: "" } };
    }
    case "commit": {
      const current = draftOf(drafts, action.cardId);
      return {
        ...drafts,
        [action.cardId]: { ...current, committed: true, pendingLocal: action.pendingLocal },
      };
    }
  }
}
