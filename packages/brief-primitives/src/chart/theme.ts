// Module: chart/theme -- ../tokens.ts mapped into a Vega-Lite `config`
// block. The chart substrate's equivalent of ../diagram/dot.ts's
// NODE_STYLE_ATTRS, and it exists for the same reason that one does.
//
// WHY THIS FILE ARRIVED LATE (kb/primitives/principles.md's P-D, and the
// standing typography decision of 2026-07-28, forebrief record seq 25):
// that decision was taken while looking at Graphviz output, because
// Graphviz output was the only output that existed -- no chart had ever
// rendered real content. So `grep TOKENS src/chart/` returned nothing:
// every visual choice here was Vega stock, which is precisely the "an
// inherited default, not a decision" failure P-D was rewritten to name.
// The palette is the one exception, and it is the exception because it
// WAS decided (see ./palette.ts's provenance block).
//
// P-D applied, concretely -- what is deleted and why:
//   - the plot's bounding box (`view.stroke: null`): ../trust-frame.ts
//     already draws a frame around this SVG, and two nested rectangles
//     carry one rectangle's worth of information.
//   - tick marks (`axis.ticks: false`): a gridline already lands on every
//     labeled value, so the tick is a third mark saying what the label and
//     the grid have both said.
// And what is added, because subtraction alone leaves something merely
// bare (P-D's own correction): label padding, an axis title that recedes
// to muted normal weight rather than shouting in stock bold, and a filled
// mark that reads at 12pt instead of Vega's hollow 2px-stroked ring.
import { TOKENS } from "../tokens.js";
import type { VLConfig } from "./vega-lite-types.js";

/**
 * The one config every compiled chart carries (./compile.ts spreads it
 * into its output). A frozen module constant, not a function: PR9 wants
 * `compileChartSpec` to be a pure function of its spec's content, and a
 * theme that could vary per call would be a second, invisible input.
 */
export const CHART_CONFIG: VLConfig = {
  background: TOKENS.color.surface,
  font: TOKENS.font.family,
  // No bounding box around the plot -- the trust frame is the frame.
  view: { stroke: null },
  axis: {
    labelFont: TOKENS.font.family,
    labelFontSize: TOKENS.font.size,
    labelColor: TOKENS.color.ink,
    labelPadding: TOKENS.space.chartLabelPadding,
    // Vega's stock limit silently truncates a category name to an
    // ellipsis ("Remove the irrele…"), which is information loss dressed
    // as layout: a truncated label labels nothing, and P-C's whole claim
    // is that the label sits ON the thing. Raised to fit a realistic
    // category name; a limit still exists so one pathological label
    // cannot eat the plot.
    labelLimit: TOKENS.space.chartLabelLimit,
    // The axis title names the axis once; the tick labels carry the
    // values. So the title recedes (muted, normal weight) and the labels
    // stay in full ink -- "the box is furniture, the text is content".
    titleFont: TOKENS.font.family,
    titleFontSize: TOKENS.font.size,
    titleColor: TOKENS.color.inkMuted,
    titleFontWeight: "normal",
    titlePadding: TOKENS.space.chartTitlePadding,
    domainColor: TOKENS.color.border,
    domainWidth: TOKENS.stroke.chartRuleWidth,
    gridColor: TOKENS.color.border,
    gridWidth: TOKENS.stroke.chartRuleWidth,
    ticks: false,
  },
  // Filled dots read at this type size; Vega's stock hollow ring with a
  // 2px stroke competes with the gridlines behind it.
  point: { filled: true, size: 56 },
  line: { strokeWidth: TOKENS.stroke.chartMarkWidth },
  rule: { stroke: TOKENS.color.border, strokeWidth: TOKENS.stroke.chartRuleWidth },
  // The inline series end-labels ./compile.ts emits instead of a legend
  // (P-C) are text marks, and they are content, not furniture.
  text: {
    font: TOKENS.font.family,
    fontSize: TOKENS.font.size,
    fill: TOKENS.color.ink,
  },
};
