// Component: PathView -- where you are in the session, on demand.
//
// COLLAPSED BY DEFAULT, and that is a finding rather than a style choice
// (ADR-022's double-check). Redundant information costs a knowledgeable reader
// working memory even when they recognise it and try to ignore it, and the harm
// is strongest when it sits inline and weakest when it is separated and
// skippable. A path permanently occupying the screen would be the inline case.
import { useState } from "react";
import type { GroundedNode, Mastery } from "../lib/types";

export function PathView({
  planned,
  mastery,
  currentId,
}: {
  planned: GroundedNode[];
  mastery: Record<string, Mastery>;
  currentId: string;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const held = planned.filter((n) => ["grasped", "demonstrated"].includes(mastery[n.id] ?? ""));

  return (
    <div className="path-view">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? "Hide the path" : "Where am I?"}{" "}
        <span className="count" data-testid="path-count">
          {held.length} of {planned.length}
        </span>
      </button>
      {open && (
        <ol data-testid="path-list">
          {planned.map((n) => {
            const state = mastery[n.id] ?? "unseen";
            const isHeld = ["grasped", "demonstrated"].includes(state);
            return (
              <li key={n.id} className={n.id === currentId ? "here" : isHeld ? "held" : "ahead"}>
                {n.question}
                {n.id === currentId && <span className="marker"> — you are here</span>}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
