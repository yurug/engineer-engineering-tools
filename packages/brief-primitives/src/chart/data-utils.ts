// Module: chart/data-utils -- tiny, dependency-free helpers over
// `ChartSpec.data.rows` shared by ./spec.ts's validation (the series
// cardinality check, PR4/PR7) and ./compile.ts's compiler (the color
// scale's domain), so the two can never compute a different "distinct
// values" answer for the same rows.
export type ChartCellValue = string | number;
export type ChartRow = Record<string, ChartCellValue>;

/**
 * @returns every distinct value `rows[i][field]` takes, in first-seen
 *   order (deterministic given a fixed `rows` array -- PR9). Rows missing
 *   `field` entirely are skipped rather than contributing an `undefined`
 *   "value".
 */
export function distinctFieldValues(rows: readonly ChartRow[], field: string): ChartCellValue[] {
  const seen = new Set<ChartCellValue>();
  for (const row of rows) {
    const value = row[field];
    if (value !== undefined) seen.add(value);
  }
  return [...seen];
}

/** @returns `"quantitative"` iff every row that HAS `field` holds a
 *  `number` there; `"nominal"` otherwise (including when no row has it --
 *  an empty axis has no evidence of being numeric). ChartSpec carries no
 *  explicit per-axis type (kb/primitives/spec.md#3-chart: x/y are only
 *  field/label/unit), so the compiler infers it from the data itself. */
export function inferFieldType(
  rows: readonly ChartRow[],
  field: string,
): "quantitative" | "nominal" {
  const values = rows.map((r) => r[field]).filter((v) => v !== undefined);
  return values.length > 0 && values.every((v) => typeof v === "number")
    ? "quantitative"
    : "nominal";
}
