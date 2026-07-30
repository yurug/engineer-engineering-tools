// Module: lib/compare-matrix -- builds a @brief/primitives MatrixSpec
// from the CURRENT OPEN ROUND (kb/primitives/implementation-slices.md Step
// 2's forebrief half; kb/architecture/overview.md's web-modules section).
//
// ORIENTATION DECISION (dogfood record, logged to .forebrief/decisions.jsonl
// and to kb/primitives/implementation-slices.md's Step 2 entry): a card
// becomes a matrix CRITERION (column), and an option's POSITION ("1".."4")
// becomes a matrix OPTION (row) -- not the reverse. Two reasons:
//   1. It matches the convention @brief/primitives's matrix renderer
//      itself uses -- options as rows, criteria as columns, cells keyed
//      `cells[option][criterion]` (kb/primitives/spec.md's own field
//      order in MatrixSpec).
//   2. A round's cards legitimately carry different option COUNTS (2-4 per
//      `CardSubmission`'s own spec, kb/spec/data-model.md) -- keying rows
//      by POSITION means a card offering only 2 options leaves rows 3/4
//      genuinely absent for that column, which is exactly the matrix
//      renderer's own "missing cell renders as an explicit dash" contract
//      (kb/primitives/spec.md#4-trade-off-matrix) doing real work, rather
//      than inventing a shared option identity across unrelated cards.
//
// Card-copy rule 6 (kb/conventions/card-copy.md): criteria are labeled by
// the card's PROMPT, never its id -- ids are locators, not labels.
import type { MatrixCell, MatrixSpec } from "@brief/primitives/matrix";
import { PRIMITIVES_SCHEMA_VERSION } from "@brief/primitives";
import type { Grounding, OptionKey, StoredCard, StoredOption } from "./types";

const OPTION_POSITIONS: readonly OptionKey[] = ["1", "2", "3", "4"];

/** Weakest grounding across one option's own claims (its consequences plus
 *  its reversibility verdict) -- PR3's per-cell exception needs exactly
 *  one trust value per cell, and an option is only as trustworthy as its
 *  least-grounded claim. */
function weakestOptionTrust(option: StoredOption): "grounded" | "conjecture" {
  const groundings: Grounding[] = [
    ...option.consequences.map((c) => c.grounding),
    option.reversibility.grounding,
  ];
  return groundings.some((g) => g.kind === "conjecture") ? "conjecture" : "grounded";
}

/** P-H (kb/primitives/principles.md): the matrix stays dry, no narrative --
 *  the option's label plus its first consequence, a factual "[default]"
 *  tag when it is the card's own default, never a story. */
function cellText(card: StoredCard, option: StoredOption): string {
  const firstConsequence = option.consequences[0]?.text;
  const body = firstConsequence ? `${option.label} — ${firstConsequence}` : option.label;
  return option.key === card.default ? `[default] ${body}` : body;
}

function setCell(
  cells: Record<string, Record<string, MatrixCell>>,
  optionKey: string,
  criterionKey: string,
  cell: MatrixCell,
): void {
  const row = cells[optionKey] ?? {};
  row[criterionKey] = cell;
  cells[optionKey] = row;
}

/**
 * @param cards the current open round's cards (`SessionState.cards`) --
 *   callers gate on `cards.length > 0` themselves (an empty round has
 *   nothing to compare).
 * @param title optional round title, carried through to the spec's own
 *   optional `title` field when the caller has one.
 * @returns a MatrixSpec ready for `renderMatrix` (the "./matrix" entry).
 */
export function buildRoundMatrixSpec(cards: readonly StoredCard[], title?: string): MatrixSpec {
  const options = OPTION_POSITIONS.map((position) => ({
    key: position,
    label: `Option ${position}`,
  }));
  const criteria = cards.map((card) => ({ key: card.id, label: card.prompt }));

  const cells: Record<string, Record<string, MatrixCell>> = {};
  let sawConjecture = false;
  for (const card of cards) {
    for (const option of card.options) {
      const trust = weakestOptionTrust(option);
      if (trust === "conjecture") sawConjecture = true;
      setCell(cells, option.key, card.id, { text: cellText(card, option), trust });
    }
  }

  return {
    schemaVersion: PRIMITIVES_SCHEMA_VERSION,
    kind: "matrix",
    // PR3: the whole-visual frame takes the weakest claim across every
    // cell -- renderMatrix itself re-derives this too (ADR-011's own
    // "envelope is the floor" rule), but stating it accurately here means
    // a caller inspecting the spec alone (before rendering) already sees
    // the right answer.
    trust: sawConjecture ? "conjecture" : "grounded",
    options,
    criteria,
    cells,
    ...(title !== undefined ? { title } : {}),
  };
}
