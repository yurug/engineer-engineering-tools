// Module: chart/vega-lite-types -- a hand-written, DELIBERATELY MINIMAL
// type for the constrained subset of Vega-Lite JSON ./compile.ts ever
// emits. Not imported from the real "vega-lite" package (even as a
// type-only import): keeping every mention of "vega"/"vega-lite" confined
// to ./render.ts's dynamic `import()` calls is what lets
// test/pr6-chart-entry-isolation.test.ts prove, via the same static
// source-graph walker every other PR6 test uses
// (test/support/walk-module-graph.ts), that "./chart"'s compile-only
// surface never statically reaches either package -- see ./render.ts's
// header for the real esbuild measurement this decision rests on.
//
// This is NOT a general Vega-Lite type -- it only shapes what THIS
// compiler produces (one mark OR one layer array, one x/one y, an
// optional color/text channel), which is exactly the vocabulary PR4
// needs to stay checkable by structural inspection.
export type VLFieldType = "quantitative" | "nominal";

export interface VLScale {
  readonly domain: readonly (string | number)[];
  readonly range: readonly string[];
}

/** How a NOMINAL axis orders its categories: by an aggregate of the field
 *  encoded on the opposite, quantitative axis. Vega-Lite's own shorthand
 *  forms (`"-x"`, `"ascending"`, ...) are deliberately NOT modeled -- this
 *  compiler only ever emits the explicit object, so the aggregate op is
 *  visible in the compiled output instead of being defaulted by Vega. */
export interface VLSortByField {
  readonly field: string;
  readonly op: "median";
  readonly order: "descending";
}

export interface VLPositionEncoding {
  readonly field?: string;
  readonly aggregate?: "count";
  readonly type: VLFieldType;
  readonly title?: string;
  readonly bin?: true;
  readonly sort?: VLSortByField;
}

export interface VLColorEncoding {
  readonly field: string;
  readonly type: "nominal";
  readonly scale: VLScale;
  /** @invariant PR4 -- ALWAYS `null`. This compiler never omits the
   *  property (an omitted `legend` would let Vega-Lite draw its default),
   *  so "no legend for a labelable series" holds by construction, not by
   *  convention. */
  readonly legend: null;
}

export interface VLTextEncoding {
  readonly field: string;
  readonly type: "nominal";
}

export interface VLEncoding {
  readonly x?: VLPositionEncoding;
  readonly y?: VLPositionEncoding;
  readonly color?: VLColorEncoding;
  readonly text?: VLTextEncoding;
}

export type VLMarkType = "line" | "bar" | "point" | "boxplot";

export interface VLMark {
  readonly type: VLMarkType;
  /** A literal, constant mark color -- set only when there is no `series`
   *  (so no color ENCODING channel exists at all, and thus no possible
   *  legend). Always a member of `CHART_PALETTE` (PR4). */
  readonly color?: string;
}

export interface VLTextMark {
  readonly type: "text";
  readonly align: "left";
  readonly dx: number;
  readonly dy: number;
}

export type VLWindowTransform = {
  readonly window: readonly { readonly op: "rank"; readonly as: string }[];
  readonly sort: readonly {
    readonly field: string;
    readonly order: "descending";
  }[];
  readonly groupby: readonly string[];
};
export type VLFilterTransform = { readonly filter: string };
export type VLTransform = VLWindowTransform | VLFilterTransform;

export interface VLLayer {
  readonly mark: VLMark | VLTextMark;
  readonly transform?: readonly VLTransform[];
  readonly encoding: VLEncoding;
}

export interface VLData {
  readonly values: readonly Record<string, string | number>[];
}

interface VLUnitSpec {
  readonly mark?: VLMark;
  readonly encoding?: VLEncoding;
  readonly layer?: readonly VLLayer[];
}

/** The subset of Vega-Lite's `config` block ./theme.ts populates from
 *  ../tokens.ts. Every field here exists to REPLACE a Vega stock default,
 *  so the shape is exactly "what we decided", not "what Vega offers". */
export interface VLConfig {
  readonly background: string;
  readonly font: string;
  readonly view: { readonly stroke: null };
  readonly axis: {
    readonly labelFont: string;
    readonly labelFontSize: number;
    readonly labelColor: string;
    readonly labelPadding: number;
    readonly labelLimit: number;
    readonly titleFont: string;
    readonly titleFontSize: number;
    readonly titleColor: string;
    readonly titleFontWeight: "normal";
    readonly titlePadding: number;
    readonly domainColor: string;
    readonly domainWidth: number;
    readonly gridColor: string;
    readonly gridWidth: number;
    readonly ticks: false;
  };
  readonly point: { readonly filled: true; readonly size: number };
  readonly line: { readonly strokeWidth: number };
  readonly rule: { readonly stroke: string; readonly strokeWidth: number };
  readonly text: {
    readonly font: string;
    readonly fontSize: number;
    readonly fill: string;
  };
}

/** The full compiled output: a single-view spec, or a `facet`-wrapped one
 *  (Vega-Lite's small-multiples shape) around the same unit spec. */
export interface VegaLiteSpec extends VLUnitSpec {
  readonly $schema: string;
  readonly data: VLData;
  readonly config: VLConfig;
  readonly facet?: {
    readonly field: string;
    readonly type: "nominal" | "ordinal";
  };
  readonly spec?: VLUnitSpec;
}

export const VEGA_LITE_SCHEMA_URL =
  "https://vega.github.io/schema/vega-lite/v6.json";
