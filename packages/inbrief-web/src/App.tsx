// Component: App -- the session shell. Fetch state, show one move, let the human
// claim mastery, let them end it.
//
// One move at a time, not a list. A list invites skimming, and the whole premise
// is that the engineer is being taught rather than handed documentation.
//
// What is offered is the FRINGE, not the whole map: nodes whose prerequisites
// the engineer already holds. A node still waiting on something is not shown at
// all, rather than shown greyed out, because a visible locked node is an
// invitation to wonder what is behind it, which is attention spent on the map
// instead of on the thing being taught.
import { useCallback, useEffect, useState } from "react";
import { Api, tokenFromUrl } from "./lib/api";
import { Move } from "./components/Move";
import { Closing } from "./components/Closing";
import { Opening } from "./components/Opening";
import { PathView } from "./components/PathView";
import { QuestionBox } from "./components/QuestionBox";
import { Returning } from "./components/Returning";
import type { GroundedNode, Mastery, SessionState, SteerabilityStatement } from "./lib/types";

/** Everything the graph permits right now, in the map's own order. */
function teachableNodes(state: SessionState): GroundedNode[] {
  return state.nodes.filter((n) => state.fringe.includes(n.id));
}

/**
 * @param at where the engineer browsed to, or null to follow the server
 * @returns the node on screen
 * @invariant browsing WINS while it lasts. The server's `next` is the default
 *   position, not an override; treating it as an override is what made Back and
 *   Next inert.
 */
function currentNode(state: SessionState, at: number | null): GroundedNode | undefined {
  const teachable = teachableNodes(state);
  if (teachable.length === 0) return undefined;
  if (at !== null) return teachable[Math.max(0, Math.min(at, teachable.length - 1))];
  return state.next !== null
    ? (teachable.find((n) => n.id === state.next) ?? teachable[0])
    : teachable[0];
}

export function App({ api }: { api: Api }): React.JSX.Element {
  const [state, setState] = useState<SessionState | null>(null);
  /**
   * Where the engineer has browsed to, or null to follow the server's choice.
   *
   * It was a plain number, and the rendered node was `next ?? teachable[at]`, so
   * whenever the server had a choice the Back and Next buttons moved `at` and
   * changed nothing on screen. Reported from the first tezqed session as "I
   * could not move to the next point" (ADR-030).
   */
  const [at, setAt] = useState<number | null>(null);
  const [revisitId, setRevisitId] = useState<string | null>(null);
  const [closing, setClosing] = useState<SteerabilityStatement | null>(null);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setState(await api.state());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [api]);

  const endSession = useCallback(async () => {
    try {
      setClosing(await api.close());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [api]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const claim = useCallback(
    async (mastery: Mastery) => {
      const node = state
        ? (state.nodes.find((candidate) => candidate.id === revisitId) ?? currentNode(state, at))
        : undefined;
      if (!node) return;
      const wasRevisit = revisitId !== null;
      try {
        await api.setMastery(node.id, mastery);
        // Back to following the server: a claim changes what is teachable, and
        // staying on a browsed index would leave the engineer somewhere the
        // session no longer means.
        setAt(null);
        setRevisitId(null);
        // Re-read rather than patching local state: the server re-grounds every
        // citation on each read, so a refresh is also how a rotted citation
        // starts showing as unverified without a reload.
        await refresh();
        if (wasRevisit) setStarted(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [api, at, refresh, revisitId, state],
  );

  if (error !== null) return <p className="error">{error}</p>;
  if (state === null) return <p>Loading…</p>;
  if (closing !== null) return <Closing statement={closing} />;

  // The path the session announced, in its own order, for the opening and the
  // "where am I" view. Falls back to the map when nothing was planned.
  const planned =
    state.agenda.length > 0
      ? state.agenda.flatMap((id) => state.nodes.filter((n) => n.id === id))
      : state.nodes;

  // A session this engineer has been in before opens differently (ADR-033). It
  // takes precedence over the intent screen: re-announcing what the session is
  // for, to someone who already walked it, is the thing that read as the tool
  // having forgotten them.
  const beenHereBefore = state.nodes.some((n) => (state.mastery[n.id] ?? "unseen") !== "unseen");
  if (!started && beenHereBefore && state.nodes.length > 0) {
    return (
      <main className="app">
        <Returning
          nodes={state.nodes}
          mastery={state.mastery}
          revised={state.revised ?? []}
          hasMaterial={state.fromMaterial.length > 0}
          onRevisit={(id) => {
            setRevisitId(id);
            setStarted(true);
          }}
          onContinue={() => setStarted(true)}
          onEnd={() => void endSession()}
        />
      </main>
    );
  }

  // The intent screen shows once, before teaching. Skipped entirely when the
  // agent proposed no intent, because an empty orientation is worse than none.
  if (!started && state.intent !== null && state.nodes.length > 0) {
    return (
      <main className="app">
        <Opening intent={state.intent} planned={planned} onStart={() => setStarted(true)} />
      </main>
    );
  }

  // `next` is the server's choice: the agenda's pick among what the graph allows.
  // Falling back to the fringe keeps an unplanned session working exactly as before.
  const teachable = teachableNodes(state);
  const node =
    state.nodes.find((candidate) => candidate.id === revisitId) ?? currentNode(state, at);
  const position = teachable.findIndex((n) => n.id === node?.id);
  if (!node) {
    // Two different nothings, and conflating them would mislead. An empty map
    // means the agent has proposed nothing; a non-empty map with an empty
    // fringe means everything currently reachable has been claimed.
    return (
      <main className="app">
        <p data-testid="empty">
          {state.nodes.length === 0
            ? "Nothing in the map yet. The agent has not proposed anything to teach."
            : "Everything reachable is covered. Nothing here is waiting on a prerequisite you have not claimed."}
        </p>
        {state.nodes.length > 0 && (
          <nav className="session-nav">
            <button type="button" onClick={() => setStarted(false)}>
              Review map
            </button>
            <button type="button" className="end" onClick={() => void endSession()}>
              End session
            </button>
          </nav>
        )}
      </main>
    );
  }

  return (
    <main className="app">
      <Move
        node={node}
        mastery={state.mastery[node.id] ?? "unseen"}
        onClaim={(m) => void claim(m)}
      />
      <PathView planned={planned} mastery={state.mastery} currentId={node.id} />
      <QuestionBox nodeId={node.id} onAsk={(text) => void api.ask(text, node.id)} />
      <nav className="session-nav">
        <span data-testid="position">
          {position + 1} / {teachable.length} teachable
        </span>
        <button type="button" disabled={position <= 0} onClick={() => setAt(position - 1)}>
          Back
        </button>
        <button
          type="button"
          disabled={position >= teachable.length - 1}
          onClick={() => setAt(position + 1)}
        >
          Next
        </button>
        {/* Ending the session is the engineer's, never the agent's (ADR-003). */}
        <button type="button" className="end" onClick={() => void endSession()}>
          End session
        </button>
      </nav>
    </main>
  );
}

/** Wires the real Api from the page's own URL. Kept out of App so tests inject. */
export function AppFromUrl(): React.JSX.Element {
  const token = tokenFromUrl(window.location.search);
  if (token === null) {
    return (
      <p className="error">
        No token in this URL. Open the link `inbrief serve` printed rather than the bare origin.
      </p>
    );
  }
  return <App api={new Api(token)} />;
}
