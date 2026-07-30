// Module: chart/index -- @brief/primitives's "./chart" entry point
// (package.json `exports` map).
//
// PR6 (extended for this step): importing this file for `ChartSpecSchema`/
// `compileChartSpec` alone pulls in NEITHER Graphviz NOR Vega -- see
// ./render.ts's header for the measured proof and the rendering-path
// decision. `renderChart`/`renderChartBody` are re-exported from here too
// (this entry, like "./diagram", combines spec+render), but the
// "vega"/"vega-lite" imports inside them are DYNAMIC, so they only cost a
// consumer anything at the moment `renderChart` is actually called, not at
// import time -- see test/pr6-chart-entry-isolation.test.ts.
//
// Key design decision: explicit named re-exports, NOT `export * from` --
// see ../index.ts's header for the full Vite CJS/ESM interop rationale
// this repeats.
export type {
  ChartForm,
  ChartData,
  ChartAxis,
  ChartSeries,
  ChartFacet,
  ChartBody,
  ChartSpec,
} from "./spec.js";
export { ChartFormSchema, ChartBodySchema, ChartSpecSchema } from "./spec.js";

export { CHART_PALETTE, MAX_CHART_SERIES_VALUES } from "./palette.js";

export { compileChartSpec } from "./compile.js";
export type { VegaLiteSpec } from "./vega-lite-types.js";

export type { ChartRenderOutcome } from "./render.js";
export { renderChart, renderChartBody } from "./render.js";
