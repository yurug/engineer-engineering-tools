// Component: CompareView -- kb/primitives/implementation-slices.md Step
// 2's forebrief half: the current open round rendered as an options-by-
// criteria trade-off matrix via @brief/primitives/matrix. PR6: this
// import is DOM-only (no Graphviz/Vega pulled in transitively) -- see
// test/lib/bundle-budget.test.ts for the ≤50KB assertion this relies on.
//
// The "ok"/"skew" branch is `dangerouslySetInnerHTML`'d verbatim: the
// library's own output is already escaped (PR2) and self-contained (a
// standalone `<div>`/`<svg>` fragment), so re-parsing it through JSX would
// add nothing. The "invalid" branch never reaches that path -- it renders
// `error.message` as ordinary JSX text (React escapes it), since building
// that one string manually here would reintroduce exactly the raw-
// interpolation risk PR2 exists to rule out.
import { useMemo } from "react";
import { renderMatrix } from "@brief/primitives/matrix";
import { buildRoundMatrixSpec } from "../lib/compare-matrix";
import type { StoredCard } from "../lib/types";

export function CompareView({
  cards,
  title,
}: {
  cards: readonly StoredCard[];
  title?: string;
}): React.JSX.Element {
  const outcome = useMemo(() => renderMatrix(buildRoundMatrixSpec(cards, title)), [cards, title]);

  if (outcome.status === "invalid") {
    return (
      <p className="compare-error" role="alert" data-testid="compare-view-error">
        Compare view could not render: {outcome.error.message}
      </p>
    );
  }

  return (
    <div
      className="compare-view"
      data-testid="compare-view"
      data-status={outcome.status}
      dangerouslySetInnerHTML={{ __html: outcome.html }}
    />
  );
}
