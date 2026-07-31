// Module: chart/compile -- ChartSpec -> a constrained Vega-Lite JSON spec
// (kb/primitives/spec.md#3-chart). Pure, synchronous, and dependency-free
// of "vega"/"vega-lite" themselves (see ./vega-lite-types.ts's header) --
// this is the half of "./chart" any consumer can use, tree-shaken clean,
// without ever paying for a Vega runtime (./render.ts does the rendering).
//
// PR4 is enforced HERE, structurally, not by convention:
//   - no legend for a labelable series -- every color channel this file
//     emits sets `legend: null` explicitly (VLColorEncoding requires it).
//   - no second y scale -- this file never emits a `y2` key nor more than
//     one DISTINCT y encoding across a compiled output's layers (every
//     layer's own `y` is the SAME field/aggregate).
//   - palette from the validated set -- every color value comes from
//     `CHART_PALETTE`, sliced from its start, never reordered.
//   - no pie -- there is no arc/pie entry in `MARK_BY_FORM`; `ChartForm`
//     itself (./spec.ts) has no such member.
import type { ChartSpec, ChartForm, ChartAxis } from "./spec.js";
import { CHART_PALETTE } from "./palette.js";
import { CHART_CONFIG } from "./theme.js";
import { sortForNominalAxis } from "./axis-order.js";
import { distinctFieldValues, inferFieldType } from "./data-utils.js";
import {
  VEGA_LITE_SCHEMA_URL,
  type VegaLiteSpec,
  type VLColorEncoding,
  type VLEncoding,
  type VLFieldType,
  type VLLayer,
  type VLMark,
  type VLMarkType,
  type VLPositionEncoding,
} from "./vega-lite-types.js";

const MARK_BY_FORM: Record<ChartForm, VLMarkType> = {
  line: "line",
  bar: "bar",
  scatter: "point",
  histogram: "bar",
  box: "boxplot",
};

/** Forms whose `series` gets an end-of-series inline text label (P-C,
 *  item 4: "inline series labels at line ends rather than a legend").
 *  Deliberately NOT histogram/box: a binned x or a distribution mark has
 *  no single rankable "last row" the way an ordered line/bar/point
 *  sequence does. Those two forms still lose the legend when `series` is
 *  present (PR4 holds for every form uniformly) -- they just have no
 *  inline-label substitute yet, a documented gap (kb/primitives/
 *  implementation-slices.md Step 3's findings), not a silent omission. */
const FORMS_WITH_END_LABELS = new Set<ChartForm>(["line", "bar", "scatter"]);

function axisTitle(axis: Pick<ChartAxis, "label" | "unit">): string {
  return axis.unit ? `${axis.label} (${axis.unit})` : axis.label;
}

function buildAxisEncoding(
  axis: ChartAxis,
  type: VLFieldType,
  bin: boolean,
): VLPositionEncoding {
  return {
    field: axis.field,
    type,
    title: axisTitle(axis),
    ...(bin ? { bin: true as const } : {}),
  };
}

/** histogram's y is ALWAYS a count aggregate -- ChartSpec's shared,
 *  form-agnostic x/y shape has no per-form "aggregate" vocabulary, so
 *  `spec.y.field` is read for nothing here; only `spec.y.label`/`.unit`
 *  name the axis (kb/primitives/spec.md's chart section records this as
 *  the compiler's own decision, not something the schema states). */
function buildYEncoding(
  spec: ChartSpec,
  yType: VLFieldType,
): VLPositionEncoding {
  if (spec.form !== "histogram") return buildAxisEncoding(spec.y, yType, false);
  return { aggregate: "count", type: "quantitative", title: axisTitle(spec.y) };
}

function buildColorEncoding(
  seriesField: string,
  domain: readonly (string | number)[],
): VLColorEncoding {
  return {
    field: seriesField,
    type: "nominal",
    scale: { domain, range: CHART_PALETTE.slice(0, domain.length) },
    legend: null, // PR4: never omitted, so no default legend can appear.
  };
}

function buildSeriesEndLabelLayer(
  xField: string,
  xEncoding: VLPositionEncoding,
  yEncoding: VLPositionEncoding,
  seriesField: string,
  colorEncoding: VLColorEncoding,
): VLLayer {
  return {
    mark: { type: "text", align: "left", dx: 4, dy: -4 },
    transform: [
      {
        window: [{ op: "rank", as: "__seriesEndRank" }],
        sort: [{ field: xField, order: "descending" }],
        groupby: [seriesField],
      },
      { filter: "datum.__seriesEndRank === 1" },
    ],
    encoding: {
      x: xEncoding,
      y: yEncoding,
      text: { field: seriesField, type: "nominal" },
      color: colorEncoding,
    },
  };
}

interface UnitSpec {
  mark?: VLMark;
  encoding?: VLEncoding;
  layer?: VLLayer[];
}

function buildUnitSpec(spec: ChartSpec): UnitSpec {
  const xType = inferFieldType(spec.data.rows, spec.x.field);
  const yType = inferFieldType(spec.data.rows, spec.y.field);
  const xSort = sortForNominalAxis(xType, yType, spec.y.field, spec.form);
  const ySort = sortForNominalAxis(yType, xType, spec.x.field, spec.form);
  const xEncoding: VLPositionEncoding = {
    ...buildAxisEncoding(spec.x, xType, spec.form === "histogram"),
    ...(xSort ? { sort: xSort } : {}),
  };
  const yEncoding: VLPositionEncoding = {
    ...buildYEncoding(spec, yType),
    ...(ySort ? { sort: ySort } : {}),
  };

  if (!spec.series) {
    // No series -> ONE constant mark color, never a color ENCODING
    // channel at all -- so no legend is even possible (PR4).
    return {
      mark: { type: MARK_BY_FORM[spec.form], color: CHART_PALETTE[0] },
      encoding: { x: xEncoding, y: yEncoding },
    };
  }

  const domain = distinctFieldValues(spec.data.rows, spec.series.field);
  const colorEncoding = buildColorEncoding(spec.series.field, domain);
  const mainLayer: VLLayer = {
    mark: { type: MARK_BY_FORM[spec.form] },
    encoding: { x: xEncoding, y: yEncoding, color: colorEncoding },
  };
  if (!FORMS_WITH_END_LABELS.has(spec.form)) return { layer: [mainLayer] };
  const labelLayer = buildSeriesEndLabelLayer(
    spec.x.field,
    xEncoding,
    yEncoding,
    spec.series.field,
    colorEncoding,
  );
  return { layer: [mainLayer, labelLayer] };
}

/**
 * @invariant PR9 -- pure function of `spec`'s content: same input, same
 *   output object shape (no ids/timestamps anywhere in this file).
 */
export function compileChartSpec(spec: ChartSpec): VegaLiteSpec {
  const data = { values: spec.data.rows };
  const unit = buildUnitSpec(spec);
  if (!spec.facet)
    return {
      $schema: VEGA_LITE_SCHEMA_URL,
      data,
      config: CHART_CONFIG,
      ...unit,
    };
  // Facet channel needs a DISCRETE type; a numeric facet field still
  // facets (one panel per distinct value), so it reads as "ordinal", not
  // "quantitative" (which Vega-Lite's facet channel does not support).
  const facetType =
    inferFieldType(spec.data.rows, spec.facet.field) === "quantitative"
      ? "ordinal"
      : "nominal";
  return {
    $schema: VEGA_LITE_SCHEMA_URL,
    data,
    config: CHART_CONFIG,
    facet: { field: spec.facet.field, type: facetType },
    spec: unit,
  };
}
