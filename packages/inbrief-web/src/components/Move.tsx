// Component: Move -- one screen of the session. A question, a short answer, and
// where that answer comes from.
//
// The citation is not decoration. P1 says every claim points at something real
// and that a claim we cannot currently vouch for renders VISIBLY differently. So
// the grounding is part of the move rather than a footnote, and an ungrounded
// citation gets a marker a reader cannot miss instead of a subtle colour change
// nobody notices.
import { useState } from "react";
import type { Grounding, GroundedNode, Mastery } from "../lib/types";

/**
 * How the current state reads to the person in it.
 *
 * The raw state name was rendered, so the page said "unseen" under the buttons.
 * That is an internal vocabulary shown to someone who never chose it, and it
 * reads as a verdict on them rather than as a record of what they said.
 */
const SAID: Record<Mastery, string> = {
  unseen: "You have not said anything about this yet",
  introduced: "You have read this",
  grasped: "You said you could explain this",
  demonstrated: "You showed this",
  shaky: "You said something here has not landed",
  contested: "You disagreed with this",
  invalidated: "This no longer holds",
};

/** The states a human can claim. Off-path ones are their signal, not a grade. */
const CLAIMS: { mastery: Mastery; label: string; hint: string }[] = [
  { mastery: "introduced", label: "Seen it", hint: "I have read this, no more than that" },
  { mastery: "grasped", label: "I follow", hint: "I could explain this to someone else" },
  { mastery: "shaky", label: "Not sure", hint: "Something here has not landed" },
  { mastery: "contested", label: "I disagree", hint: "I think this claim is wrong" },
];

export function Move({
  node,
  mastery,
  onClaim,
}: {
  node: GroundedNode;
  mastery: Mastery;
  onClaim: (mastery: Mastery) => void;
}): React.JSX.Element {
  return (
    <article className="move">
      <p className="mode" data-testid="mode">
        {node.mode}
      </p>
      <h1 className="question">{node.question}</h1>
      <p className="answer">{node.answer}</p>

      <ul className="grounding" data-testid="grounding">
        {node.grounding.map((g, i) => (
          <li key={i} className={g.kind}>
            <Source grounding={g} />
          </li>
        ))}
      </ul>

      <div className="claims" role="group" aria-label="What do you make of this?">
        {CLAIMS.map((claim) => (
          <button
            key={claim.mastery}
            type="button"
            title={claim.hint}
            aria-pressed={mastery === claim.mastery}
            onClick={() => onClaim(claim.mastery)}
          >
            {claim.label}
          </button>
        ))}
      </div>
      <p className="current" data-testid="current-mastery" data-mastery={mastery}>
        {SAID[mastery]}
      </p>
    </article>
  );
}

/**
 * One citation: the reference, and the lines it points at on demand.
 *
 * Showing the source ADJACENT to the claim is contiguity, the largest effect in
 * the evidence this family collected (g~0.74), whose design implication is never
 * to split an explanation from the code it describes. It is disclosed on click
 * rather than always open because permanently visible extras cost a knowledgeable
 * reader working memory (ADR-022's constraint). Adjacent when shown, absent when
 * not: both findings are satisfied, neither is traded away.
 */
function Source({ grounding }: { grounding: Grounding }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const ref = describe(grounding.citation);
  return (
    <span className="source">
      {grounding.kind === "grounded" ? (
        <span aria-hidden="true">✓ </span>
      ) : (
        // "Unverified" says we cannot vouch for it, where "invalid" would claim
        // the citation is wrong. It may be right about a file that moved.
        <strong>Unverified </strong>
      )}
      <button type="button" className="ref" aria-expanded={open} onClick={() => setOpen(!open)}>
        <code>{ref}</code>
      </button>
      {grounding.kind === "conjecture" && <span className="reason"> — {grounding.reason}</span>}
      {open &&
        (grounding.excerpt.length === 0 ? (
          <p className="excerpt empty" data-testid="excerpt">
            Nothing is there now. The file or those lines are gone.
          </p>
        ) : (
          <pre className="excerpt" data-testid="excerpt">
            <code>{grounding.excerpt.join("\n")}</code>
          </pre>
        ))}
      {open && grounding.kind === "conjecture" && grounding.excerpt.length > 0 && (
        <p className="excerpt-note">
          This is what is at those lines now, not what the claim was made against.
        </p>
      )}
    </span>
  );
}

/** `path:startLine-endLine`, the form that is clickable in a terminal. */
function describe(citation: GroundedNode["grounding"][number]["citation"]): string {
  if (citation.startLine === undefined) return citation.path;
  const end = citation.endLine ?? citation.startLine;
  return `${citation.path}:${String(citation.startLine)}-${String(end)}`;
}
