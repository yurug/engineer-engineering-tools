// Module: svg-utils -- tiny, dependency-free helpers for reading and
// rewriting the SVG shapes this package's renderers emit (kb/primitives/
// spec.md: Graphviz's "spec -> DOT -> bundled Graphviz (WebAssembly) ->
// SVG", and, since Step 3, Vega's "compiled Vega-Lite -> vega `View` ->
// SVG").
//
// Deliberately NOT a general XML parser/DOM. Both source formats are
// stable and narrow -- one root <svg width=".." height="..." ...> tag --
// so a dependency-free string scanner is both sufficient and auditable
// against formats we don't control but that don't change shape across
// renders. Kept dependency-free specifically so trust-frame.ts (the "."
// entry) can use `svgDimensions`/`svgBody` without pulling in Graphviz,
// Vega, or any DOM library (PR6).
//
// PR3/ADR-011's chart-step "biggest unknown," resolved favorably
// (kb/primitives/implementation-slices.md Step 3): Graphviz emits
// width/height IN POINTS (`width="100pt"`); vega's `View.toSVG()` emits
// the SAME attributes as bare numbers (`width="363"`, no unit, no XML
// prolog) -- verified against real output, not assumed. Vega's shape is
// otherwise identical (one root <svg>, no nested <svg>), so
// `wrapWithTrustFrame` wraps a Vega chart exactly as it wraps a Graphviz
// diagram, no per-substrate branching needed -- the regex below just
// makes the unit suffix OPTIONAL rather than requiring "pt" specifically.
export interface SvgDimensions {
  width: number;
  height: number;
}

// Width before height, both on the root <svg> tag, in either format
// (Graphviz: pt-suffixed; Vega: unitless) -- see kb note above.
const ROOT_SVG_DIMENSIONS_RE =
  /<svg\b[^>]*\swidth="([\d.]+)(?:pt)?"[^>]*\sheight="([\d.]+)(?:pt)?"/;

/** @throws if `svg` isn't a Graphviz- or Vega-shaped SVG document (missing
 *  the root tag's own width/height attributes, pt-suffixed or bare). */
export function svgDimensions(svg: string): SvgDimensions {
  const match = ROOT_SVG_DIMENSIONS_RE.exec(svg);
  if (!match)
    throw new Error(
      "not a Graphviz- or Vega-shaped SVG: no root width/height attributes",
    );
  return { width: Number(match[1]), height: Number(match[2]) };
}

/** @returns everything between the root `<svg ...>` open tag and its
 *  matching `</svg>` close tag -- i.e. the document with its XML prolog,
 *  DOCTYPE, and root tag stripped, ready to nest inside another `<svg>`
 *  (see trust-frame.ts). */
export function svgBody(svg: string): string {
  const openMatch = /<svg\b[^>]*>/.exec(svg);
  if (!openMatch) throw new Error("not an SVG document: no root <svg> tag");
  const start = openMatch.index + openMatch[0].length;
  const end = svg.lastIndexOf("</svg>");
  if (end === -1 || end < start)
    throw new Error("not an SVG document: no closing </svg> tag");
  return svg.slice(start, end);
}

/**
 * Minimal XML text escaping for content placed inside an SVG `<text>`
 * element's CONTENT (not an attribute value -- attribute values also need
 * `"` escaped, text content does not).
 *
 * @invariant PR2 -- this is the only path a label string takes into
 *   rendered output. It always escapes, never interpolates raw markup, so
 *   a markup-shaped label (`<img onerror=...>`) renders as literal visible
 *   text, never as a parsed element.
 */
export function escapeXmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
