// Module: chart/render -- ChartSpec -> compiled Vega-Lite -> static SVG ->
// trust frame (kb/primitives/spec.md#3-chart's rendering path).
//
// RENDERING-PATH DECISION (kb/primitives/implementation-slices.md Step 3,
// dogfood record): "vega"/"vega-lite" are imported ONLY as dynamic
// `import()` calls INSIDE this function's body, never as a top-level
// static import anywhere in "./chart"'s module graph. This was measured,
// not assumed (2026-07-26, real esbuild bundles in scratch, both using
// the actual vega-lite `compile()` + vega `parse`/`View`/`toSVG()` call
// chain):
//   - a consumer that STATICALLY imports `compile` from "vega-lite" at a
//     module's top level, then never calls the function using it, still
//     ships 572,970 bytes minified (~559.5 KB) -- vega/vega-lite carry
//     module-evaluation side effects esbuild/Rollup cannot prove safe to
//     drop, so a static import forces the WHOLE graph in regardless of
//     which export is referenced (the same CJS-shaped lesson PR6's step-2
//     note recorded for zod, but here it bites even on genuine ESM).
//   - the SAME code behind a DYNAMIC `import()`, never called, tree-shakes
//     to 77 bytes -- unused, it is provably dead code, dynamic-import call
//     site included.
//   - actually CALLING this renderer (a real one-point chart, vega-lite
//     `compile` + vega `parse`+`View`+`toSVG`) bundles to 785,785 bytes
//     minified (~767.4 KB) / 269,730 bytes gzipped (~263.4 KB) -- ~5x the
//     50 KB budget forebrief's own bundle-budget test holds "./matrix" to.
//
// DECISION: chart rendering is effectively server/build-time-only. A
// bundle that imports "./chart" for `ChartSpecSchema`/`compileChartSpec`
// alone (never calling `renderChart`) pays nothing (proven by
// test/pr6-chart-entry-isolation.test.ts, the same static-graph walker
// every other PR6 test uses -- dynamic `import()` calls are invisible to
// it, so "vega"/"vega-lite" never appear as reachable packages from
// "./chart"). A caller that DOES call `renderChart` -- intended to be a
// Node/build-time/server context producing a static SVG string the
// browser only ever embeds -- pays the full measured cost as an isolated,
// lazily-loaded chunk, never inline in a consumer's main bundle.
import { checkSchemaVersion, PRIMITIVES_SCHEMA_VERSION } from "../version.js";
import { renderSkewBanner } from "../skew-banner.js";
import { wrapWithTrustFrame, type EmbedOptions } from "../trust-frame.js";
import { PrimitiveSchemaError } from "../schema-error.js";
import { ChartSpecSchema, type ChartSpec } from "./spec.js";
import { compileChartSpec } from "./compile.js";

export type ChartRenderOutcome =
  | { status: "ok"; svg: string }
  | { status: "skew"; svg: string }
  | { status: "invalid"; error: PrimitiveSchemaError };

function versionOf(raw: unknown): string | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const version = (raw as Record<string, unknown>).schemaVersion;
  return typeof version === "string" ? version : undefined;
}

/**
 * Renders an already-validated chart body to a raw (un-framed) SVG
 * string. Exposed separately from `renderChart` so ./dispatch.ts (the
 * claim card's evidence path) can reuse it against an already-parsed
 * spec without a second schemaVersion/shape re-check.
 *
 * @invariant PR9 -- vega's own view rendering is deterministic given a
 *   fixed spec and no random/time-based channel (this vocabulary has
 *   none): the same spec renders byte-identical SVG on every call.
 */
export async function renderChartBody(
  spec: Pick<ChartSpec, "form" | "data" | "x" | "y" | "series" | "facet">,
): Promise<string> {
  const vegaLiteSpec = compileChartSpec(spec as ChartSpec);
  // Dynamic on purpose -- see this file's header.
  const [{ compile }, vega] = await Promise.all([import("vega-lite"), import("vega")]);
  const { spec: vgSpec } = compile(vegaLiteSpec as never);
  const view = new vega.View(vega.parse(vgSpec), { renderer: "none" });
  return await view.toSVG();
}

/**
 * @param raw an untrusted parsed-JSON value.
 * @invariant PR5 -- a schemaVersion mismatch returns `{status:"skew"}`
 *   with the rendered banner, checked before shape validation.
 * @invariant PR7 -- an invalid spec returns `{status:"invalid"}` whose
 *   `error.message` names the failing field path (the series-cardinality
 *   cap fails at `series.field`, per ./spec.ts).
 */
export async function renderChart(
  raw: unknown,
  options: EmbedOptions = {},
): Promise<ChartRenderOutcome> {
  const specVersion = versionOf(raw);
  if (specVersion !== undefined) {
    const versionCheck = checkSchemaVersion(specVersion);
    if (!versionCheck.ok) return { status: "skew", svg: renderSkewBanner(versionCheck) };
  }
  const parsed = ChartSpecSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      status: "invalid",
      error: new PrimitiveSchemaError("malformed chart spec", parsed.error.issues),
    };
  }
  const spec: ChartSpec = parsed.data;
  const rawSvg = await renderChartBody(spec);
  return {
    status: "ok",
    svg: wrapWithTrustFrame(rawSvg, spec.trust, {
      primitive: "chart",
      schemaVersion: PRIMITIVES_SCHEMA_VERSION,
      ...options,
    }),
  };
}
