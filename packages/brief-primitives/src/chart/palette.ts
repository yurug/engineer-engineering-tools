// Module: chart/palette -- the ONLY colors the chart compiler (./compile.ts)
// may ever emit (PR4: "a palette drawn from the validated set").
//
// PROVENANCE: values copied verbatim 2026-07-26 from the agentic-dev-kit
// repo's `dataviz` skill, `references/palette.md`, "Categorical palette"
// table -- LIGHT column only (this package has no dark-mode token variant
// yet, see ../tokens.ts's header: "SVG attributes can't reference
// `var(--x)` reliably across every renderer"). Not a runtime dependency:
// the kit is a Claude Code skill, not an npm package, so the eight hex
// strings below are copied, not imported. Re-copy this block (and update
// the date) if the source palette is ever re-validated with different
// values -- do not hand-edit a single hex without re-running the source
// skill's `scripts/validate_palette.js` first.
//
// ORDER IS THE CVD-SAFETY MECHANISM, NOT COSMETIC (source doc, verbatim):
// "This order passes every hard gate in both modes on the default
// *adjacent* pairlist (stacks, bars, lines): worst adjacent CVD ΔE 9.1
// light / 8.4 dark (OKLab x100, >=8 target), worst adjacent normal-vision
// ΔE 19.6 light / 19.3 dark (>=15 floor)." ./compile.ts NEVER reorders or
// cycles this array -- it only ever takes a PREFIX (`CHART_PALETTE.slice(0,
// n)`), which is exactly the slots the source doc validated together.
//
// KNOWN, DOCUMENTED GAP (do not silently paper over): the source doc also
// says "Under `--pairs all` (scatter, bubble, choropleth, small
// multiples)... the first three slots validate all-pairs... Past three,
// fold to Other or facet." ChartSpec's own schema (./spec.ts) caps `series`
// at <=6 distinct values UNIFORMLY across every `form`, per
// kb/primitives/spec.md's literal text -- it does not carve out a
// stricter cap for `form:"scatter"`. A 4-6 series SCATTER chart therefore
// carries a known, inherited CVD-safety gap beyond slot 3 (only the
// ADJACENT-pair gate, not the ALL-PAIRS gate the source doc scopes to
// scatter-shaped encodings, is guaranteed past 3 series). Flagged here and
// in kb/primitives/spec.md's chart section rather than inventing an
// undocumented, stricter per-form cap the KB does not ask for.
export const CHART_PALETTE = [
  "#2a78d6", // 1 blue
  "#eb6834", // 2 orange
  "#1baf7a", // 3 aqua
  "#eda100", // 4 yellow
  "#e87ba4", // 5 magenta
  "#008300", // 6 green
  "#4a3aa7", // 7 violet
  "#e34948", // 8 red
] as const;

/** The chart schema's own series cap (kb/primitives/spec.md#3-chart: "<=6
 *  distinct values, else a field-path schema error") -- kept next to the
 *  palette it's paired with so the two can never drift apart silently. */
export const MAX_CHART_SERIES_VALUES = 6;
