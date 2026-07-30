// Component: ConsequenceRow -- one option's consequence line, in one of the
// two chromes ADR-002 requires: grounded (solid, citation ref shown) or
// conjecture (dashed, non-authoritative). `grounding` is READ, never
// computed, here (ADR-002: "the browser renders verdicts, never computes
// them") -- this component has no branch that could invent a grounded look.
import type { StoredConsequence } from "../lib/types";

function citationRef(citation: StoredConsequence["citation"]): string {
  if (!citation) return "";
  const lines =
    citation.startLine !== undefined && citation.endLine !== undefined
      ? `:${String(citation.startLine)}-${String(citation.endLine)}`
      : "";
  return `${citation.path}${lines}`;
}

export function ConsequenceRow({
  consequence,
}: {
  consequence: StoredConsequence;
}): React.JSX.Element {
  const grounding = consequence.grounding;
  const grounded = grounding.kind === "grounded";
  return (
    <div
      className={`con ${grounded ? "grounded" : "conjecture"}`}
      data-grounding={grounded ? "grounded" : "conjecture"}
    >
      <span className="tag">{grounded ? "grounded" : "conjecture"}</span>
      {consequence.text}
      {grounding.kind === "grounded" && (
        <span className="cite">{"⎁ " + citationRef(grounding.citation)}</span>
      )}
    </div>
  );
}
