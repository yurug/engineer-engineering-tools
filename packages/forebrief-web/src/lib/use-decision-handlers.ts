// Module: lib/use-decision-handlers -- every user action on the CURRENT
// card (select, accept-default, text edits, undo, commit) plus T2's
// send-or-buffer fallback and T3's nudge. Split out from App.tsx so the
// component stays composition-only (kb/conventions/code-style.md: files <
// 200 lines).
import { useCallback, useEffect, useState } from "react";
import { postRecord, type ApiConfig } from "./api";
import type { DraftTextField } from "./draft-reducer";
import { bufferSubmission } from "./local-buffer";
import { shouldNudge } from "./nudge";
import { BLANK_DRAFT, clampIndex, type CardDraft } from "./round-queue";
import type { DwellTracker } from "./use-dwell";
import type { SessionState } from "./use-session-state";
import type { OptionKey, RecordSubmission, StoredCard } from "./types";

const NUDGE_MESSAGE =
  "Override without rationale — say why it matters. Enter again commits it bare.";

/** Shown the moment a counter-proposal reaches the log. The field clears on
 *  commit and the card deliberately stays open, so without this the human
 *  sees their text vanish and reasonably concludes it was dropped. */
const COUNTER_RECORDED_MESSAGE =
  "Counter-proposal recorded. This card stays open until the agent studies it.";

export interface DecisionHandlers {
  currentCard: StoredCard | null;
  currentDraft: CardDraft;
  nudgeMessage: string | null;
  handleSelect: (key: OptionKey) => void;
  handleAcceptDefault: () => void;
  handleTextChange: (field: DraftTextField, text: string) => void;
  handleUndo: () => void;
  handleNavigate: (delta: 1 | -1) => void;
  handleCommit: () => Promise<void>;
}

export function useDecisionHandlers(
  api: ApiConfig,
  session: SessionState,
  dwell: DwellTracker,
  focusRationale: () => void,
): DecisionHandlers {
  const { cards, currentIndex, drafts, dispatchDraft, repoRoot } = session;
  const currentCard = cards[currentIndex] ?? null;
  const currentDraft = currentCard ? (drafts[currentCard.id] ?? BLANK_DRAFT) : BLANK_DRAFT;
  const [nudgeMessage, setNudgeMessage] = useState<string | null>(null);

  useEffect(() => setNudgeMessage(null), [currentCard?.id]);

  const handleSelect = useCallback(
    (key: OptionKey) => {
      if (!currentCard) return;
      dispatchDraft({ type: "select", card: currentCard, key });
    },
    [currentCard, dispatchDraft],
  );

  const handleAcceptDefault = useCallback(() => {
    if (!currentCard) return;
    dispatchDraft({ type: "select", card: currentCard, key: currentCard.default });
  }, [currentCard, dispatchDraft]);

  const handleTextChange = useCallback(
    (field: DraftTextField, text: string) => {
      if (!currentCard) return;
      dispatchDraft({ type: "set-text", cardId: currentCard.id, field, text });
    },
    [currentCard, dispatchDraft],
  );

  const handleUndo = useCallback(() => {
    if (!currentCard) return;
    dispatchDraft({ type: "undo", cardId: currentCard.id });
    setNudgeMessage(null);
  }, [currentCard, dispatchDraft]);

  const handleNavigate = useCallback(
    (delta: 1 | -1) => {
      session.setCurrentIndex((i) => clampIndex(i + delta, cards.length));
    },
    [session, cards.length],
  );

  /** @returns true if the server acked it; false if it was buffered (T2) instead. */
  const sendOrBuffer = useCallback(
    async (cardId: string, submission: RecordSubmission): Promise<boolean> => {
      try {
        await postRecord(api, submission);
        return true;
      } catch {
        if (repoRoot) bufferSubmission(repoRoot, cardId, submission, new Date().toISOString());
        return false;
      }
    },
    [api, repoRoot],
  );

  const handleCommit = useCallback(async (): Promise<void> => {
    if (!currentCard) return;
    const cardId = currentCard.id;
    const draft = drafts[cardId] ?? BLANK_DRAFT;
    if (draft.committed) return; // P5: already decided, read-only

    // T4: ask/feedback text is independent of the decision -- flush it
    // regardless of whether a choice has been made yet.
    if (draft.askWhyText.trim()) {
      void sendOrBuffer(cardId, { kind: "ask_why", card: cardId, text: draft.askWhyText.trim() });
      dispatchDraft({ type: "clear-ask-why", cardId });
    }
    if (draft.askContextText.trim()) {
      void sendOrBuffer(cardId, {
        kind: "ask_context",
        card: cardId,
        text: draft.askContextText.trim(),
      });
      dispatchDraft({ type: "clear-ask-context", cardId });
    }
    // A counter-proposal rejects the option set, so it is flushed on the same
    // T4 footing as the asks: it must reach the log even though the card is
    // deliberately left undecided.
    if (draft.counterText.trim()) {
      void sendOrBuffer(cardId, {
        kind: "counter_proposal",
        card: cardId,
        text: draft.counterText.trim(),
        ...(draft.rationale.trim() ? { rationale: draft.rationale.trim() } : {}),
        source_channel: "ui",
      });
      dispatchDraft({ type: "clear-counter", cardId });
      // The field clears and the card stays put, which read as "ignored" the
      // first time a human used it (author feedback, 2026-07-27). Say what
      // happened, immediately; the thread below then shows the record itself.
      setNudgeMessage(COUNTER_RECORDED_MESSAGE);
    }
    if (draft.feedbackText.trim()) {
      void sendOrBuffer(cardId, {
        kind: "feedback",
        card: cardId,
        text: draft.feedbackText.trim(),
      });
      dispatchDraft({ type: "clear-feedback", cardId });
    }

    if (!draft.chosen || !draft.mode) return; // nothing chosen yet -- asks above already sent

    if (shouldNudge(draft.mode, draft.rationale, draft.nudged)) {
      dispatchDraft({ type: "mark-nudged", cardId });
      setNudgeMessage(NUDGE_MESSAGE);
      focusRationale();
      return;
    }

    setNudgeMessage(null);
    const dwellMsValue = Math.round(dwell.getDwellMs(cardId));
    const submission: RecordSubmission = {
      kind: "decision",
      card: cardId,
      chosen: draft.chosen,
      mode: draft.mode,
      source_channel: "ui",
      dwell_ms: dwellMsValue,
      ...(draft.rationale.trim() ? { rationale: draft.rationale.trim() } : {}),
    };
    const acked = await sendOrBuffer(cardId, submission);
    dwell.resetDwell(cardId);
    dispatchDraft({ type: "commit", cardId, pendingLocal: !acked });
    session.setCurrentIndex((i) => clampIndex(i + 1, cards.length));
  }, [
    currentCard,
    drafts,
    dispatchDraft,
    dwell,
    sendOrBuffer,
    focusRationale,
    session,
    cards.length,
  ]);

  return {
    currentCard,
    currentDraft,
    nudgeMessage,
    handleSelect,
    handleAcceptDefault,
    handleTextChange,
    handleUndo,
    handleNavigate,
    handleCommit,
  };
}
