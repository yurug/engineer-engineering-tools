// Module: chart/spec -- ChartSpec's zod schema (kb/primitives/
// spec.md#3-chart): a constrained vocabulary compiled to Vega-Lite, never
// raw Vega-Lite. Classic "zod" (not "zod/mini") -- mirrors diagram/spec.ts:
// "./chart" is never reachable from a matrix-only or claim-without-
// evidence consumer (PR6), so the bundle-budget pressure that pushed
// envelope.ts/matrix/spec.ts to zod/mini doesn't apply here.
//
// PR4 -- "the chart schema makes pie, dual axes, detached legends, and >6
// categorical series UNREPRESENTABLE, not discouraged": this file supplies
// half of that (the series cap, the only field ChartSpec itself
// constrains); the rest (no pie mark, no second y scale, no legend) is
// ./compile.ts's job -- there is simply no vocabulary HERE for a second y
// field, an arc/pie form, or a legend toggle, so those aren't rejected,
// they're absent.
import { z } from "zod";
import { envelopeFields } from "../envelope.js";
import { distinctFieldValues } from "./data-utils.js";
import { MAX_CHART_SERIES_VALUES } from "./palette.js";

export const ChartFormSchema = z.enum(["line", "bar", "scatter", "histogram", "box"]);
export type ChartForm = z.infer<typeof ChartFormSchema>;

const ChartCellValueSchema = z.union([z.string(), z.number()]);

const ChartDataSchema = z.strictObject({
  /** @invariant at least one row -- an empty chart has nothing to compile
   *  a mark from. */
  rows: z.array(z.record(z.string(), ChartCellValueSchema)).min(1),
});
export type ChartData = z.infer<typeof ChartDataSchema>;

const ChartAxisSchema = z.strictObject({
  field: z.string().min(1),
  label: z.string().min(1),
  unit: z.string().min(1).optional(),
});
export type ChartAxis = z.infer<typeof ChartAxisSchema>;

const ChartSeriesSchema = z.strictObject({ field: z.string().min(1) });
export type ChartSeries = z.infer<typeof ChartSeriesSchema>;

const ChartFacetSchema = z.strictObject({ field: z.string().min(1) });
export type ChartFacet = z.infer<typeof ChartFacetSchema>;

const chartBodyFields = {
  kind: z.literal("chart"),
  form: ChartFormSchema,
  data: ChartDataSchema,
  x: ChartAxisSchema,
  y: ChartAxisSchema,
  series: ChartSeriesSchema.optional(),
  facet: ChartFacetSchema.optional(),
} as const;

interface ChartBodyLike {
  data: { rows: readonly Record<string, string | number>[] };
  series?: { field: string } | undefined;
}

/**
 * @invariant PR4/PR7 -- kb/primitives/spec.md#3-chart: "a seventh series
 *   value fails at `series.field`" -- named here exactly as the spec
 *   promises, not a generic top-level message.
 */
function checkSeriesCardinality(body: ChartBodyLike, ctx: z.RefinementCtx): void {
  if (!body.series) return;
  const distinct = distinctFieldValues(body.data.rows, body.series.field);
  if (distinct.length > MAX_CHART_SERIES_VALUES) {
    ctx.addIssue({
      code: "custom",
      message:
        `series field "${body.series.field}" has ${String(distinct.length)} distinct ` +
        `values, exceeding the ${String(MAX_CHART_SERIES_VALUES)}-series cap (PR4: a ` +
        `7th categorical series is unrepresentable, not merely discouraged)`,
      path: ["series", "field"],
    });
  }
}

/** The chart BODY: form/data/x/y/series/facet only, no envelope -- same
 *  split as diagram/spec.ts's DiagramBodySchema, kept for symmetry even
 *  though no other spec currently embeds a chart body standalone. */
export const ChartBodySchema = z.strictObject(chartBodyFields).superRefine(checkSeriesCardinality);
export type ChartBody = z.infer<typeof ChartBodySchema>;

/** The full, standalone chart spec: envelope fields + the body above. */
export const ChartSpecSchema = z
  .strictObject({ ...envelopeFields, ...chartBodyFields })
  .superRefine(checkSeriesCardinality);
export type ChartSpec = z.infer<typeof ChartSpecSchema>;
