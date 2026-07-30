// Module: lib/use-session-state -- bootstrap (GET /api/state) + live
// updates (WS) + T2 detection/replay + per-card draft state, bundled for
// App.tsx. Split out from the component so App.tsx stays composition-only
// (kb/conventions/code-style.md: files < 200 lines).
import { useEffect, useMemo, useReducer, useState } from "react";
import { fetchState, type ApiConfig } from "./api";
import { draftReducer, type DraftAction } from "./draft-reducer";
import { replayBuffer } from "./local-buffer";
import { mergeEnvelopes } from "./records";
import { clampIndex, initialDrafts, isRoundComplete, type CardDraft } from "./round-queue";
import { useServerGone } from "./server-gone";
import { useForebriefSocket } from "./use-forebrief-socket";
import type { CardSummary, Envelope, StateResponse, StoredCard } from "./types";

export interface SessionState {
  loading: boolean;
  /** True once the FIRST bootstrap attempt has failed and no later one has succeeded -- the only case ReconnectBanner has no known `repoRoot` to show. */
  neverBootstrapped: boolean;
  repoRoot: string | null;
  cards: StoredCard[];
  /** id -> prompt/labels for EVERY posted card (closed rounds included) -- derived surfaces label cards with this, never bare ids. */
  cardIndex: Record<string, CardSummary>;
  records: Envelope[];
  drafts: Record<string, CardDraft>;
  dispatchDraft: React.Dispatch<DraftAction>;
  currentIndex: number;
  setCurrentIndex: React.Dispatch<React.SetStateAction<number>>;
  gone: boolean;
  pendingCountKnown: boolean;
}

export function useSessionState(api: ApiConfig): SessionState {
  const [bootstrapped, setBootstrapped] = useState<StateResponse | null>(null);
  const [everBootstrapped, setEverBootstrapped] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchState(api)
      .then((state) => {
        if (cancelled) return;
        setBootstrapped(state);
        setEverBootstrapped(true);
      })
      .catch(() => undefined); // useServerGone (below) is the durable source of truth for reachability
    return () => {
      cancelled = true;
    };
  }, [api.httpOrigin, api.humanToken]);

  const { connected, envelopes: liveEnvelopes } = useForebriefSocket(
    api.httpOrigin,
    api.humanToken,
  );
  const { gone, recoveredTick } = useServerGone(api, connected);

  const records = useMemo(
    () => mergeEnvelopes(bootstrapped?.records ?? [], liveEnvelopes),
    [bootstrapped, liveEnvelopes],
  );
  const cards = bootstrapped?.round?.cards ?? [];
  const repoRoot = bootstrapped?.repoRoot ?? null;

  const [drafts, dispatchDraft] = useReducer(draftReducer, {});
  const [currentIndex, setCurrentIndex] = useState(0);

  // Re-seed ONLY when a genuinely new round shows up (round.id changes) --
  // never on every live-record merge, or an in-progress typed rationale
  // would be wiped mid-edit by the round's own decision echoing back over WS.
  useEffect(() => {
    if (!bootstrapped) return;
    dispatchDraft({ type: "seed", drafts: initialDrafts(cards, records) });
    setCurrentIndex(0);
  }, [bootstrapped?.round?.id]);

  // T2: replay whatever's buffered for this repo -- on first bootstrap (a
  // NEW page opened after re-serve, buffer left by the OLD dead tab) and
  // again on every later recovery (recoveredTick, kb/properties/edge-
  // cases.md#T2).
  useEffect(() => {
    if (!repoRoot) return;
    void replayBuffer(repoRoot, api);
  }, [repoRoot, recoveredTick]);

  return {
    loading: !bootstrapped && !everBootstrapped,
    neverBootstrapped: !everBootstrapped,
    repoRoot,
    cards,
    cardIndex: bootstrapped?.cardIndex ?? {},
    records,
    drafts,
    dispatchDraft,
    currentIndex: clampIndex(currentIndex, cards.length),
    setCurrentIndex,
    gone,
    pendingCountKnown: repoRoot !== null,
  };
}

export { isRoundComplete };
