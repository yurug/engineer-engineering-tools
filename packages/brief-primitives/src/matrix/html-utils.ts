// Module: matrix/html-utils -- minimal, dependency-free HTML text escaping
// for the matrix renderer's build-DOM-as-string output (kb/primitives/
// spec.md#4-trade-off-matrix: "Built DOM, no library"). Mirrors ../svg-
// utils.ts's escapeXmlText (same three characters matter for a TEXT node
// in either XML or HTML); kept as its own tiny module rather than reusing
// svg-utils.ts directly, since that file's header scopes itself to
// Graphviz-shaped SVG parsing, a concern this renderer doesn't share.
//
// @invariant PR2 -- every spec-provided string (option/criterion label,
// cell text) reaches the rendered output only through escapeHtmlText;
// render.ts never interpolates one of these fields raw. Attribute values
// this renderer emits (data-trust, indices) are always drawn from a closed
// enum or a numeric loop index, never from spec-provided free text, so no
// attribute-escaping helper is needed here.
export function escapeHtmlText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
