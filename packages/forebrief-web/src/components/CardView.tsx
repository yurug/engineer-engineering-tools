// Component: CardView -- one card, presentational (all state and keyboard
// routing lives one level up, App.tsx's Session, per lib/use-card-
// keyboard.ts's header). Renders the two chromes (OptionCard/
// ConsequenceRow/ReversibilityBadge), the action panel (override
// rationale, ask-why, ask-context, feedback), the ask-context/ask-why
// thread in place (T4), and the default tag (card-copy.md: "default
// tagged").
import type { DraftTextField } from "../lib/draft-reducer";
import type { CardDraft } from "../lib/round-queue";
import type { Envelope, OptionKey, StoredCard } from "../lib/types";
import { ActionPanel, type ActionPanelRefs } from "./ActionPanel";
import { AskThread } from "./AskThread";
import { CardVisual } from "./CardVisual";
import { OptionCard } from "./OptionCard";

export function CardView({
  card,
  draft,
  index,
  total,
  decidedCount,
  thread,
  nudgeMessage,
  pendingLocal,
  refs,
  filmstripStepIndex,
  onFilmstripStep,
  onSelect,
  onTextChange,
}: {
  card: StoredCard;
  draft: CardDraft;
  index: number;
  total: number;
  decidedCount: number;
  thread: readonly Envelope[];
  nudgeMessage: string | null;
  pendingLocal: boolean;
  refs: ActionPanelRefs;
  filmstripStepIndex: number;
  onFilmstripStep: (delta: 1 | -1) => void;
  onSelect: (key: OptionKey) => void;
  onTextChange: (field: DraftTextField, text: string) => void;
}): React.JSX.Element {
  return (
    <div className="card active" data-testid="card-view" data-card-id={card.id}>
      <div className="top">
        <div className="kind">
          {card.kind} · card {index + 1}/{total}
        </div>
        <div className="prog">
          committed {decidedCount}/{total}
        </div>
      </div>
      <h2>{card.prompt}</h2>
      <p className="context">{card.context}</p>
      {card.visual && (
        <CardVisual visual={card.visual} stepIndex={filmstripStepIndex} onStep={onFilmstripStep} />
      )}
      {draft.committed && (
        <p className="already-decided" role="status">
          {pendingLocal
            ? "saved locally — will sync once the server is reachable again"
            : `already decided — chose ${draft.chosen ?? "?"} (${draft.mode ?? "?"})`}
        </p>
      )}
      {card.options.map((option) => (
        <OptionCard
          key={option.key}
          option={option}
          isDefault={option.key === card.default}
          isSelected={draft.chosen === option.key}
          disabled={draft.committed}
          onSelect={onSelect}
        />
      ))}
      {nudgeMessage && (
        <p className="nudge" role="alert">
          {nudgeMessage}
        </p>
      )}
      <ActionPanel
        refs={refs}
        rationale={draft.rationale}
        askWhyText={draft.askWhyText}
        askContextText={draft.askContextText}
        counterText={draft.counterText}
        feedbackText={draft.feedbackText}
        showRationale={draft.mode === "override"}
        onChange={onTextChange}
      />
      <AskThread thread={thread} />
    </div>
  );
}
