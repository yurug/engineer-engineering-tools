// Component: ReversibilityBadge -- P2's matrix rendered: `reversible` is
// grounded chrome ONLY when the server already validated an undo citation;
// `costly`/`irreversible` are always conjecture chrome (a cost/undo
// forecast is still a prediction, ADR-002). No branch here recomputes that
// verdict -- `reversibility.grounding` is read straight off the card.
import type { StoredReversibility } from "../lib/types";

const LABEL: Record<StoredReversibility["class"], string> = {
  reversible: "reversible",
  costly: "costly",
  irreversible: "irreversible",
};

export function ReversibilityBadge({
  reversibility,
}: {
  reversibility: StoredReversibility;
}): React.JSX.Element {
  const grounded = reversibility.grounding.kind === "grounded";
  return (
    <div className={`rev ${reversibility.class} ${grounded ? "grounded" : "conjecture"}`}>
      <span className="badge" data-grounding={grounded ? "grounded" : "conjecture"}>
        {LABEL[reversibility.class]}
        {grounded && reversibility.undo ? ` — undo: ${reversibility.undo.path}` : ""}
      </span>
    </div>
  );
}
