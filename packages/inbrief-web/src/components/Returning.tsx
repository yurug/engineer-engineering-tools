// Component: Returning -- what the session says to someone it already taught.
//
// A second session used to open exactly like a first one, walk the same path, and
// end with "Nothing left to teach right now." The engineer's verdict: "I fail to
// see the difference with the first session [...] That's especially disturbing as
// I've said 'I follow' for most cards during session 1" (ADR-033).
//
// So this answers two questions a first session never has to: what do I already
// hold here, and what has stopped being true since. The second half is the one
// worth coming back for, and it costs nothing to compute: the server re-validates
// every citation on every read (P1), so a held claim whose lines have moved is
// already visible in the state the browser has.
//
// @invariant a claim that ROTTED outranks everything else on this screen. The
//   engineer believes it; it is the only thing here they would otherwise act on
//   while wrong.
import type { GroundedNode, Mastery } from "../lib/types";

/** Held by this engineer's own claim, as against by the knowledge model. */
const HELD: readonly Mastery[] = ["grasped", "demonstrated"];

export interface ReturningProps {
  nodes: GroundedNode[];
  mastery: Record<string, Mastery>;
  /** True when the project carries material, whatever the record says. */
  hasMaterial: boolean;
  /** Jumps to a node whose ground has moved. */
  onRevisit: (id: string) => void;
  onContinue: () => void;
}

/** @returns held nodes whose citations no longer all resolve. */
export function rotted(nodes: GroundedNode[], mastery: Record<string, Mastery>): GroundedNode[] {
  return nodes.filter(
    (n) =>
      HELD.includes(mastery[n.id] ?? "unseen") && n.grounding.some((g) => g.kind === "conjecture"),
  );
}

export function Returning({
  nodes,
  mastery,
  hasMaterial,
  onRevisit,
  onContinue,
}: ReturningProps): React.JSX.Element {
  const held = nodes.filter((n) => HELD.includes(mastery[n.id] ?? "unseen"));
  const moved = rotted(nodes, mastery);
  const fresh = nodes.filter((n) => (mastery[n.id] ?? "unseen") === "unseen");

  return (
    <section className="returning" data-testid="returning">
      <h1>You have been here before</h1>
      <p className="intent">
        {held.length} of {nodes.length} claims are ones you said you follow.
      </p>

      {moved.length > 0 && (
        <section className="rotted">
          <h2>These stopped standing up</h2>
          <p className="note">
            You hold these, and the lines they cite have moved since. Nothing says the claim is now
            wrong, only that nobody can vouch for it.
          </p>
          <ul data-testid="rotted">
            {moved.map((n) => (
              <li key={n.id}>
                <button type="button" onClick={() => onRevisit(n.id)}>
                  {n.question}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {fresh.length > 0 ? (
        <p data-testid="fresh-count">
          {fresh.length} claim{fresh.length === 1 ? "" : "s"} you have not seen.
        </p>
      ) : moved.length === 0 ? (
        // The honest empty case, and it is a real answer rather than a shrug: the
        // map is covered and still stands. "Nothing left to teach right now" said
        // the same thing in a way that read as a failure.
        <p data-testid="all-still-standing">
          Nothing new, and nothing you hold has moved. The map is covered and still stands.
        </p>
      ) : null}

      {hasMaterial && held.length === 0 && nodes.length > 0 && (
        // The wiped-record case. Material exists, so somebody has been taught
        // here, and this record remembers none of it. Said rather than guessed:
        // a first session and a lost record are indistinguishable from inside.
        <p className="note" data-testid="no-history">
          This project carries teaching material and this record holds no history for any of it.
          Either this is the first session here, or the record was lost.
        </p>
      )}

      <button type="button" onClick={onContinue}>
        Continue
      </button>
    </section>
  );
}
