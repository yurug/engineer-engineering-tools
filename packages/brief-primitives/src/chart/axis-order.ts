// Module: chart/axis-order -- how a nominal axis orders its categories.
// One rule, split out of ./compile.ts because it is a DECISION with a
// stated cost rather than a mechanical encoding step, and because the
// budget in kb/conventions/code-style.md is a design probe: the compiler
// is "spec -> Vega-Lite shape", this is "what does a categorical axis
// mean", and those are two responsibilities.
import type { ChartForm } from "./spec.js";
import type { VLFieldType, VLSortByField } from "./vega-lite-types.js";

/**
 * A nominal axis facing a quantitative one is RANKED BY IT, descending --
 * the compiler's own decision, in the same class as ./compile.ts's
 * histogram `y` special case, and taken for the same reason. Vega-Lite's
 * default orders a nominal scale by its own LABEL TEXT, so a chart whose
 * argument IS a ranking draws that ranking alphabetically. Found the first
 * time a chart carried real content (`kb/primitives/visuals/
 * effect-sizes.html`: six design levers, drawn in the order A-L-M-R-R-V,
 * which is no order at all).
 *
 * `median`, not `max`: a category holding several rows is a spread, and
 * ranking spreads by their top lets one wide range outrank a tighter,
 * higher-centred one. Where each category holds a single row -- the common
 * case -- every op agrees, so this choice is invisible until it matters.
 *
 * THE KNOWN COST, taken deliberately: a nominal axis whose categories
 * carry an INTRINSIC order (months, severity levels, pipeline stages) is
 * reordered by magnitude here, which is worse than alphabetical, because
 * it invents a ranking the data does not have. `ChartSpec` has no
 * vocabulary for declaring an ordinal axis, so this cannot be detected
 * today; the first chart that needs one is the signal to add that
 * vocabulary, not to weaken this rule.
 *
 * @param nominalType the inferred type of the axis being ordered
 * @param opposingType the inferred type of the other axis
 * @param opposingField the other axis's field, to rank by
 * @returns the sort to attach, or `undefined` when there is nothing to
 *   rank by (two nominal axes, two quantitative axes, or a histogram)
 * @invariant PR9 -- pure: no clock, no ids, no module state.
 */
export function sortForNominalAxis(
  nominalType: VLFieldType,
  opposingType: VLFieldType,
  opposingField: string,
  form: ChartForm,
): VLSortByField | undefined {
  // A histogram's x is binned and its y is a count aggregate: both axes
  // already carry an intrinsic numeric order, and neither is a category
  // whose order is up for decision.
  if (form === "histogram") return undefined;
  if (nominalType !== "nominal" || opposingType !== "quantitative") return undefined;
  return { field: opposingField, op: "median", order: "descending" };
}
