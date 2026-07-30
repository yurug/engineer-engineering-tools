// Module: App -- top-level page: reads the token from the URL, then
// mounts the Session (ADR-005-style split: App resolves identity, Session
// does everything else -- kept as two exports so tests can mount Session
// directly against a REAL server origin without fighting jsdom's own
// location, see test/integration/t2-reconnect-e2e.test.ts's header).
import { useMemo, useRef, useState } from "react";
import type { ApiConfig } from "./lib/api";
import { pendingCardIds } from "./lib/local-buffer";
import { openProvisionals, recordsForCards, threadForCard } from "./lib/records";
import { buildCompletionSummary } from "./lib/completion";
import { useCardKeyboard } from "./lib/use-card-keyboard";
import { useDecisionHandlers } from "./lib/use-decision-handlers";
import { useDwellTracker } from "./lib/use-dwell";
import { useFilmstripStepper } from "./lib/use-filmstrip-stepper";
import { isRoundComplete, useSessionState } from "./lib/use-session-state";
import type { ActionPanelRefs } from "./components/ActionPanel";
import { AwaitingReconciliationList } from "./components/AwaitingReconciliationList";
import { CompareView } from "./components/CompareView";
import { KeyHintBar } from "./components/KeyHintBar";
import { CardView } from "./components/CardView";
import { CompletionScreen } from "./components/CompletionScreen";
import { ReconnectBanner } from "./components/ReconnectBanner";

/** Which of the two full-round views is showing -- orthogonal to `session`/
 *  `drafts` state, so toggling never touches a draft (kb/primitives/
 *  implementation-slices.md Step 2: "toggling back to the card flow must
 *  not lose draft state"). */
type SessionView = "cards" | "compare";

function readTokenFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get("token");
}

export function App(): React.JSX.Element {
  const humanToken = useMemo(readTokenFromUrl, []);
  const httpOrigin = window.location.origin;
  const api: ApiConfig = useMemo(
    () => ({ httpOrigin, humanToken: humanToken ?? "" }),
    [httpOrigin, humanToken],
  );

  if (!humanToken) {
    return (
      <main className="app app-error">
        <p>No token in the URL. Re-open the link `forebrief serve` printed.</p>
      </main>
    );
  }
  return <Session api={api} />;
}

export function Session({ api }: { api: ApiConfig }): React.JSX.Element {
  const session = useSessionState(api);
  const rationaleRef = useRef<HTMLTextAreaElement | null>(null);
  const askWhyRef = useRef<HTMLTextAreaElement | null>(null);
  const askContextRef = useRef<HTMLTextAreaElement | null>(null);
  const counterRef = useRef<HTMLTextAreaElement | null>(null);
  const feedbackRef = useRef<HTMLTextAreaElement | null>(null);
  const refs: ActionPanelRefs = {
    rationale: rationaleRef,
    askWhy: askWhyRef,
    askContext: askContextRef,
    counter: counterRef,
    feedback: feedbackRef,
  };

  // State lives ABOVE the card/completion/compare branch below, so
  // flipping it never re-seeds `session.drafts` (that reducer is keyed off
  // `bootstrapped?.round?.id`, not `view` -- see use-session-state.ts).
  const [view, setView] = useState<SessionView>("cards");
  const toggleView = (): void => setView((v) => (v === "cards" ? "compare" : "cards"));

  const dwell = useDwellTracker(session.cards[session.currentIndex]?.id ?? null);
  const focusRationale = (): void => rationaleRef.current?.focus();
  const handlers = useDecisionHandlers(api, session, dwell, focusRationale);

  // Card-visual round (seq 36/37): a filmstrip's stepper position is
  // ephemeral view state, not a decision draft field -- lifted here (rather
  // than local to CardView) so the keyboard binding ("."/",") and the
  // component's own buttons drive the same position (lib/use-filmstrip-
  // stepper.ts resets it on every card change).
  const currentVisual = handlers.currentCard?.visual;
  const filmstripStepCount = currentVisual?.kind === "filmstrip" ? currentVisual.steps.length : 0;
  const filmstripStepper = useFilmstripStepper(
    handlers.currentCard?.id ?? null,
    filmstripStepCount,
  );

  useCardKeyboard({
    navigate: handlers.handleNavigate,
    select: handlers.handleSelect,
    acceptDefault: handlers.handleAcceptDefault,
    focusRationale,
    focusAskWhy: () => askWhyRef.current?.focus(),
    focusAskContext: () => askContextRef.current?.focus(),
    focusCounter: () => counterRef.current?.focus(),
    focusFeedback: () => feedbackRef.current?.focus(),
    commit: () => void handlers.handleCommit(),
    undo: handlers.handleUndo,
    toggleCompare: toggleView,
    stepFilmstrip: filmstripStepper.step,
  });

  if (session.loading) {
    return (
      <main className="app">
        <p>Loading…</p>
      </main>
    );
  }

  const decidedCount = session.cards.filter((c) => session.drafts[c.id]?.committed).length;
  const complete = isRoundComplete(session.cards, session.drafts);
  const provisionals = openProvisionals(session.records);
  const pendingCount =
    session.pendingCountKnown && session.repoRoot ? pendingCardIds(session.repoRoot).length : 0;

  return (
    <main className="app">
      {session.gone && (
        <ReconnectBanner repoRoot={session.repoRoot ?? ""} pendingCount={pendingCount} />
      )}
      <AwaitingReconciliationList
        provisionals={provisionals}
        cardIndex={session.cardIndex}
        api={api}
      />
      {session.cards.length > 0 && (
        <div className="view-toggle">
          <button
            type="button"
            data-testid="view-toggle"
            aria-pressed={view === "compare"}
            onClick={toggleView}
          >
            {view === "compare" ? "‹ back to cards (m)" : "compare view (m)"}
          </button>
        </div>
      )}
      {session.cards.length === 0 && (
        <p className="empty">No open round — waiting for the agent to post cards.</p>
      )}
      {view === "compare" && session.cards.length > 0 && <CompareView cards={session.cards} />}
      {view === "cards" && complete && (
        <CompletionScreen
          summaries={buildCompletionSummary(session.cards, session.records)}
          records={recordsForCards(
            session.records,
            session.cards.map((c) => c.id),
          )}
          cardIndex={session.cardIndex}
        />
      )}
      {view === "cards" && !complete && handlers.currentCard && (
        <CardView
          card={handlers.currentCard}
          draft={handlers.currentDraft}
          index={session.currentIndex}
          total={session.cards.length}
          decidedCount={decidedCount}
          thread={threadForCard(session.records, handlers.currentCard.id)}
          nudgeMessage={handlers.nudgeMessage}
          pendingLocal={handlers.currentDraft.pendingLocal}
          refs={refs}
          filmstripStepIndex={filmstripStepper.stepIndex}
          onFilmstripStep={filmstripStepper.step}
          onSelect={handlers.handleSelect}
          onTextChange={handlers.handleTextChange}
        />
      )}
      {view === "cards" && !complete && session.cards.length > 0 && (
        <KeyHintBar
          onNavigate={handlers.handleNavigate}
          position={session.currentIndex + 1}
          total={session.cards.length}
        />
      )}
    </main>
  );
}
