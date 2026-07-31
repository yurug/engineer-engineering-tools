// Module: tokens -- design tokens as DATA, not CSS. kb/primitives/scope.md's
// agent note: "tokens and trust chrome are data contracts each renderer
// honors in its own substrate -- three substrates never share a rendering
// platform." A DOM substrate can consume these as CSS custom properties
// (`tokensToCssDeclarations`); Graphviz/SVG and any future non-DOM
// substrate (Vega) read the plain `TOKENS` object directly, since SVG
// attributes can't reference `var(--x)` reliably across every renderer
// (Graphviz's own SVG output predates CSS custom property support in some
// consumers -- inlining the literal value is the portable choice).
//
// P-D (subtraction is the strongest lever): one accent, neutrals, no
// gradients/shadows/fills -- these tokens are deliberately few.

/** Plain-object token export -- the substrate-agnostic source of truth.
 *  Every renderer (diagram, filmstrip, future matrix/chart) reads from
 *  here rather than hardcoding a hex value. */
export const TOKENS = {
  color: {
    /** The one accent P-D allows; used for emphasis, never decoration. */
    accent: "#2563eb",
    ink: "#1a1a1a",
    inkMuted: "#6b6b6b",
    surface: "#ffffff",
    border: "#d0d0d0",
    /** ADR-011's conjecture-chrome color -- never used for anything else. */
    conjecture: "#b45309",
  },
  font: {
    family: "Helvetica,Arial,sans-serif",
    size: 12,
    sizeTitle: 14,
    /** Edge labels are secondary to what they connect: smaller and muted, so
     *  the graph's shape reads before its annotations do. */
    sizeEdgeLabel: 10,
  },
  space: {
    /** Corner-tag / frame inset, in the same units as the wrapped SVG (pt). */
    frameInset: 6,
    frameCornerTagPadding: 3,
    /** Graph breathing room, in inches (Graphviz's unit for these).
     *  P-D deletes elements that carry nothing; it does not ask for a crowded
     *  drawing, and the stock separations read as cramped. */
    rankSepInches: 0.65,
    nodeSepInches: 0.4,
    /** Node label padding, inches, as Graphviz's `margin="x,y"`. */
    nodePadX: 0.18,
    nodePadY: 0.12,
    /** Rounded corners soften a box without decorating it. */
    nodeCornerRadius: 4,
    /** Chart axis breathing room, in CSS px (Vega's unit). Stock Vega sets
     *  both to 2, which butts tick labels against the plot. */
    chartLabelPadding: 6,
    chartTitlePadding: 10,
    /** Widest an axis category label may draw before Vega truncates it to
     *  an ellipsis, CSS px. Stock Vega cuts well inside a normal phrase. */
    chartLabelLimit: 260,
  },
  stroke: {
    frameWidth: 1.5,
    /** Node and edge weight. Graphviz's default 1.0 reads heavy against
     *  12pt text; the drawing should be lighter than its labels. */
    graphWidth: 0.9,
    /** Graphviz's stock arrowheads are oversized for this type size. */
    arrowScale: 0.7,
    /** Dash pattern for a conjecture frame (ADR-011: "dashed + corner tag"). */
    frameDash: "6,4",
    /** Chart axis/grid rule weight, in CSS px (Vega's unit -- NOT the same
     *  scale as `graphWidth`, which is Graphviz points; reusing that number
     *  here would be a unit confusion, not a shared token). Furniture: the
     *  grid must read below the marks it measures. */
    chartRuleWidth: 1,
    /** Chart mark weight (line/point stroke), CSS px. Vega's stock 2 reads
     *  heavy against 12pt labels -- same finding as `graphWidth`, different
     *  substrate. */
    chartMarkWidth: 1.6,
  },
  /** P-E's dim weight for de-emphasized filmstrip elements (ADR-010). */
  opacity: {
    dimmed: 0.35,
    full: 1,
  },
} as const;

export type Tokens = typeof TOKENS;

/**
 * @returns `TOKENS` flattened into `--backbrief-<dotted.path>: value;` CSS
 *   custom-property declarations, one per line, for a DOM substrate's root
 *   element (e.g. the matrix renderer, step 2). Numbers are emitted bare
 *   (a caller appends its own unit if the property needs one); this
 *   function never appends `px`/`pt` itself because not every consumer
 *   uses the same unit.
 */
export function tokensToCssDeclarations(tokens: Tokens = TOKENS): string {
  const lines: string[] = [];
  const walk = (value: unknown, path: string[]): void => {
    if (typeof value === "object" && value !== null) {
      for (const [key, child] of Object.entries(value))
        walk(child, [...path, key]);
      return;
    }
    lines.push(`--backbrief-${path.join("-")}: ${String(value)};`);
  };
  walk(tokens, []);
  return lines.join("\n");
}
