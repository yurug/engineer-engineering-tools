// Module: App -- top-level page: reads the token from the URL, connects,
// and renders the Session/Map/Code tab shell (ADR-005 decision 3, kb/
// plan.md step 3).
//
// Round 7 (ADR-007, kb/plan.md R7-2): the Session tab is now "the brief" --
// Established / This brief / Where next (kb/spec/interaction-model.md),
// one shell (components/Brief.tsx) mounted through a kind-specific wrapper
// (MoveBrief/TalkBrief/RuptureBrief) chosen by lib/brief-content.ts's
// `deriveBriefContent`. SessionMove.tsx and ChangeBreakProposal.tsx are
// RETIRED this step -- the brief replaces both (kb/plan.md: "delete/retire
// any Session component the brief replaces").
import { useCallback, useMemo, useRef, useState } from "react";
import { computeFrontier, foldMap, foldOverlay } from "@backbrief/shared/browser";
import { TabBar } from "./components/TabBar";
import { Brief, type BriefNext } from "./components/Brief";
import { MoveBrief } from "./components/MoveBrief";
import { TalkBrief } from "./components/TalkBrief";
import { RuptureBrief } from "./components/RuptureBrief";
import { MapView } from "./components/MapView";
import { CodeActivity } from "./components/CodeActivity";
import { AnnotationsInbox } from "./components/AnnotationsInbox";
import { RepoMovedBanner } from "./components/RepoMovedBanner";
import { NoKbModeNotice } from "./components/NoKbModeNotice";
import { useBackbriefSocket } from "./lib/use-backbrief-socket";
import { usePresence } from "./lib/use-presence";
import { useAwaitingAgent } from "./lib/awaiting-agent";
import { useNoKbMode } from "./lib/use-no-kb-mode";
import { useGlossary } from "./lib/use-glossary";
import { useAnnotationsInbox, countOpenAnnotations } from "./lib/annotations-inbox";
import { findLatestHeadChanged } from "./lib/repo-moved";
import { computeMapBadgeCount } from "./lib/pending-badges";
import { deriveSessionStatus } from "./lib/session-status";
import { findPendingChangeBreak } from "./lib/change-break";
import { deriveEstablished } from "./lib/established";
import { findLatestOpenOffer } from "./lib/offer-choices-fold";
import { deriveBriefContent, type BriefContent } from "./lib/brief-content";
import { postChoiceMade } from "./lib/choices-api";
import type { CodeNavRequest, CodeNavTarget } from "./lib/code-nav";
import type { TabId } from "./lib/tabs";
import type { ApiConfig } from "./lib/api";
import type { Envelope, GlossaryTerm } from "@backbrief/shared/browser";

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
        <p>No token in the URL. Re-open the link `backbrief serve` printed.</p>
      </main>
    );
  }

  return <Session api={api} />;
}

/** kb/plan.md R7-2's own running-head convention (mockup's `.head .r`) --
 *  plain context, never a proof-status claim, so a bare string per kind is
 *  all this needs. */
function runningHeadFor(content: BriefContent): string {
  switch (content.kind) {
    case "paused":
      // Deliberately NOT "fixing — session paused" verbatim -- that exact
      // string is PresenceChip's own (kb/plan.md step 4's wording), and
      // reusing it here would put the same text in two DOM nodes at once
      // for no benefit; the brief's own head just names the moment.
      return "a rupture";
    case "proposal":
      return "a finding";
    case "talk":
      return "a talk";
    case "move":
      return "a move";
    case "free-answer":
    case "empty":
      return "your call";
  }
}

function Session({ api }: { api: ApiConfig }): React.JSX.Element {
  const { frames } = useBackbriefSocket(api.httpOrigin, api.humanToken);
  const presence = usePresence(api);
  const envelopes = useMemo(() => frames.map((f) => f.envelope), [frames]);
  const headChanged = useMemo(() => findLatestHeadChanged(envelopes), [envelopes]);
  const noKbMode = useNoKbMode(api);
  const mapBadgeCount = useMemo(() => computeMapBadgeCount(envelopes), [envelopes]);
  // kb/plan.md step 4 (pedagogy-engine.md#rupture): derived live from the
  // same WS stream everything else here reads -- see lib/session-status.ts's
  // header for why this is a fold, not a poll.
  const sessionStatus = useMemo(() => deriveSessionStatus(envelopes), [envelopes]);
  const pendingChangeBreak = useMemo(() => findPendingChangeBreak(envelopes), [envelopes]);

  const nodes = useMemo(() => foldMap(envelopes), [envelopes]);
  const overlay = useMemo(() => foldOverlay(envelopes), [envelopes]);
  const frontier = useMemo(() => computeFrontier(nodes, overlay), [nodes, overlay]);

  // ADR-007 / kb/plan.md R7-2: the three parts of every brief. `established`
  // is a pure overlay derivation (no new protocol); `content` picks which
  // content kind "This brief" renders; `offer`/`next` wire "Where next" to
  // choice_made -- shared across every kind EXCEPT the rupture ones, which
  // supply their own (RuptureBrief.tsx's own header explains why).
  const established = useMemo(() => deriveEstablished(nodes, overlay), [nodes, overlay]);
  const content = useMemo(
    () => deriveBriefContent(envelopes, frames, nodes, sessionStatus, pendingChangeBreak),
    [envelopes, frames, nodes, sessionStatus, pendingChangeBreak],
  );
  const offer = useMemo(() => findLatestOpenOffer(envelopes), [envelopes]);
  // 2026-07-19 (P5's honest-pending indicator, dogfood: a clicked tactic
  // felt dead while the agent composed its reply): ONE shared instance for
  // "Where next" -- both the tactic buttons and the free textbox post
  // `choice_made`, and Where-next is the screen's single primary action
  // (visual-design.md #4), so they share one awaiting state rather than
  // one each. `begin` fires only AFTER the POST acks (P2: durable first).
  const awaitingChoice = useAwaitingAgent(envelopes, presence.agentSeen);
  const next: BriefNext = useMemo(
    () => ({
      tactics: offer?.choices ?? [],
      onChoice: (choiceId: string) =>
        void postChoiceMade(api, { choiceId }).then((ack) => awaitingChoice.begin(ack.seq)),
      onFreeText: (text: string) =>
        void postChoiceMade(api, { text }).then((ack) => awaitingChoice.begin(ack.seq)),
      awaiting: awaitingChoice,
    }),
    [api, offer, awaitingChoice],
  );

  const currentMoveNodeId = content.kind === "move" ? content.nodeId : undefined;

  // A new pending item never auto-switches the tab (Rule 0: badges only,
  // never an interruption) -- `tab` changes ONLY on an explicit TabBar click.
  const [tab, setTab] = useState<TabId>("session");

  // R7-3 (US15): the repo's glossary, fetched once (lib/use-glossary.ts) --
  // threaded into every content kind's prose via Brief.tsx/MoveBrief.tsx/
  // TalkBrief.tsx.
  const terms = useGlossary(api);

  // R7-3 ("clickable citations everywhere"): the ONE cross-tab nav target
  // every citation link / glossary "jump to definition" resolves to
  // (lib/code-nav.ts) -- switches to Code AND hands CodeActivity a fresh
  // request (the `nonce` bump is what makes re-clicking the SAME target
  // still re-scroll, code-nav.ts's own header explains why).
  const [codeNav, setCodeNav] = useState<CodeNavRequest | null>(null);
  const codeNavNonce = useRef(0);
  const openInCode = useCallback((target: CodeNavTarget) => {
    codeNavNonce.current += 1;
    setCodeNav({ ...target, nonce: codeNavNonce.current });
    setTab("code");
  }, []);

  // R7-3 (ADR-007's annotations inbox): a live count + returnable panel,
  // entirely OUTSIDE the brief -- posting an annotation can only ever touch
  // this state, never `content` above.
  const annotations = useAnnotationsInbox(api, envelopes);
  const [inboxOpen, setInboxOpen] = useState(false);

  return (
    <main className="app">
      <TabBar
        activeTab={tab}
        onSelect={setTab}
        mapBadgeCount={mapBadgeCount}
        agentSeen={presence.agentSeen}
        paused={sessionStatus === "paused-for-change"}
        inboxCount={countOpenAnnotations(annotations)}
        onToggleInbox={() => setInboxOpen((open) => !open)}
      />
      {headChanged && <RepoMovedBanner headChanged={headChanged} />}
      <NoKbModeNotice noKbMode={noKbMode} />
      {inboxOpen && (
        <AnnotationsInbox
          annotations={annotations}
          envelopes={envelopes}
          onOpenCitation={openInCode}
          onClose={() => setInboxOpen(false)}
        />
      )}
      <TabPanel id="session" activeTab={tab}>
        <SessionBrief
          api={api}
          established={established}
          next={next}
          content={content}
          envelopes={envelopes}
          agentSeen={presence.agentSeen}
          terms={terms}
          onOpenCitation={openInCode}
        />
      </TabPanel>
      <TabPanel id="map" activeTab={tab}>
        <MapView
          api={api}
          nodes={nodes}
          overlay={overlay}
          frontier={frontier}
          onOpenCitation={openInCode}
          {...(currentMoveNodeId !== undefined ? { currentMoveNodeId } : {})}
        />
      </TabPanel>
      <TabPanel id="code" activeTab={tab}>
        <CodeActivity api={api} noKbMode={noKbMode} openRequest={codeNav} />
      </TabPanel>
    </main>
  );
}

/** Dispatches to the content-kind-specific brief -- the ONE place that
 *  knows all five kinds exist; every kind mounts the SAME Brief.tsx shell
 *  (kb/plan.md R7-2's named unknown, this step's own prototype). */
function SessionBrief({
  api,
  established,
  next,
  content,
  envelopes,
  agentSeen,
  terms,
  onOpenCitation,
}: {
  api: ApiConfig;
  established: readonly string[];
  next: BriefNext;
  content: BriefContent;
  /** R7-3: TalkBrief needs the FULL stream to detect an outstanding question (lib/talk-fold.ts's `isTalkPaused`/`talkSlideThread`) -- not just its own talk frames. 2026-07-19: also the stream MoveBrief/TalkBrief's own `useAwaitingAgent` watches for the agent's next envelope. */
  envelopes: readonly Envelope[];
  /** 2026-07-19 (P5's honest-pending indicator): threaded to MoveBrief/TalkBrief so their own `useAwaitingAgent` instances classify present/away identically to the tab bar's PresenceChip (lib/presence.ts's shared threshold). */
  agentSeen: string | null;
  terms: readonly GlossaryTerm[];
  onOpenCitation: (target: CodeNavTarget) => void;
}): React.JSX.Element {
  const runningHead = runningHeadFor(content);
  switch (content.kind) {
    case "paused":
      return (
        <RuptureBrief
          api={api}
          established={established}
          runningHead={runningHead}
          variant={{ kind: "paused" }}
        />
      );
    case "proposal":
      return (
        <RuptureBrief
          api={api}
          established={established}
          runningHead={runningHead}
          variant={{ kind: "proposal", proposal: content.proposal }}
        />
      );
    case "talk":
      return (
        <TalkBrief
          api={api}
          established={established}
          runningHead={runningHead}
          talk={content.talk}
          envelopes={envelopes}
          agentSeen={agentSeen}
          next={next}
          terms={terms}
          onOpenCitation={onOpenCitation}
        />
      );
    case "move":
      return (
        <MoveBrief
          api={api}
          established={established}
          runningHead={runningHead}
          frame={content.frame}
          node={content.node}
          envelopes={envelopes}
          agentSeen={agentSeen}
          next={next}
          terms={terms}
          onOpenCitation={onOpenCitation}
        />
      );
    case "free-answer":
      return (
        <Brief
          established={established}
          runningHead={runningHead}
          headline={content.text}
          intent="Waiting on the agent's response to what you said."
          next={next}
          terms={terms}
          onOpenCitation={onOpenCitation}
        />
      );
    case "empty":
      return (
        <Brief
          established={established}
          runningHead={runningHead}
          intent="Nothing to review yet — the agent will open with a brief shortly."
          next={next}
          terms={terms}
          onOpenCitation={onOpenCitation}
        />
      );
  }
}

/** Stays mounted regardless of which tab is active (hidden via CSS, `[hidden]{display:none}`
 *  in styles.css) -- switching tabs must never lose Code's open file or Map's expanded
 *  regions, matching the round-6 mockup's own `hidden` toggle (never an unmount/remount). */
function TabPanel({
  id,
  activeTab,
  children,
}: {
  id: TabId;
  activeTab: TabId;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section className="view" role="tabpanel" hidden={id !== activeTab}>
      {children}
    </section>
  );
}
