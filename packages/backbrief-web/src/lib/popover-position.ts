// Module: lib/popover-position -- pure viewport-aware placement for an
// anchored popover (SelectionContextMenu's floating annotation composer).
//
// This module owns "where is the thing I'm anchoring to, how big is my
// popover, how big is the viewport" -> a top/left/side decision, with NO
// DOM access of its own. The caller (SelectionContextMenu.tsx) measures
// the anchor and the popover's own rendered size via
// getBoundingClientRect()/window.innerWidth/innerHeight and passes plain
// numbers in -- which is what makes this testable in a jsdom environment
// that (kb/external/codemirror6.md) does not implement real layout: a
// test can assert "given these rects, would it flip/clamp" without ever
// needing jsdom to lay anything out for real.
// Key design decision: default BELOW the anchor (the natural reading
// direction after selecting text top-to-bottom), FLIP above only when
// below genuinely doesn't fit and above has more room, and always CLAMP
// horizontally so the popover never leaves the viewport -- P1 ("grounded
// or flagged", kb/properties/functional.md) generalizes here to "never
// render off-screen or overlapping nothing sensible", even for a
// degenerate zero-sized anchor (SelectionContextMenu's fallback when CM6
// can't resolve real coordinates, lib/editor-selection.ts's own doc).
import type { Rect } from "@codemirror/view";

/** A plain rectangle in viewport (client) coordinates -- structurally compatible with both DOMRect and CodeMirror's own `Rect`, so callers never need to convert one into the other. */
export type PlacementRect = Rect;

export interface PopoverSize {
  readonly width: number;
  readonly height: number;
}

export interface PopoverPlacement {
  /** `position: fixed` top, in viewport px. */
  top: number;
  /** `position: fixed` left, in viewport px. */
  left: number;
  /** Which side of the anchor the popover ended up on -- exposed for callers/tests (e.g. a CSS arrow) even though top/left alone are enough to render it. */
  side: "below" | "above";
}

/** Gap between the anchor and the popover's near edge. */
const ANCHOR_GAP = 8;
/** Minimum distance kept between the popover and any viewport edge. */
const VIEWPORT_MARGIN = 8;

function clamp(value: number, min: number, max: number): number {
  // `Math.max(min, max)` guards the case where the popover is bigger than
  // the viewport (max < min) -- without it, `Math.min(value, max)` would
  // win and could push the result BELOW `min`, off the top/left edge.
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/**
 * @param anchor the selection's screen rect to anchor near (lib/editor-selection.ts's `selectionInfo().anchorRect`, or a caller's fallback)
 * @param viewport the current viewport size (`window.innerWidth`/`innerHeight`)
 * @param popover the popover's OWN rendered size (measured via `getBoundingClientRect()` -- this function has no DOM access, so the caller measures first, typically in a `useLayoutEffect`)
 * @returns where to place the popover: below the anchor by default, flipped above when that fits better, and always clamped so no edge leaves the viewport
 * @invariant P1 -- never returns a position that renders "broken" (off-screen, NaN); a degenerate zero-sized anchor still yields a valid on-screen position
 * @example placePopover({top: 40, bottom: 60, left: 100, right: 100}, {width: 1200, height: 800}, {width: 300, height: 150}) // => {top: 68, left: 100, side: "below"}
 */
export function placePopover(
  anchor: PlacementRect,
  viewport: PopoverSize,
  popover: PopoverSize,
): PopoverPlacement {
  const spaceBelow = viewport.height - anchor.bottom - ANCHOR_GAP - VIEWPORT_MARGIN;
  const spaceAbove = anchor.top - ANCHOR_GAP - VIEWPORT_MARGIN;
  // Below is the default; only flip when below genuinely doesn't fit AND
  // above has strictly more room -- e.g. a selection near the exact
  // vertical middle of the viewport with a tall popover stays below
  // rather than flapping between the two on tiny anchor movements.
  const side: "below" | "above" =
    spaceBelow >= popover.height || spaceBelow >= spaceAbove ? "below" : "above";
  const rawTop =
    side === "below" ? anchor.bottom + ANCHOR_GAP : anchor.top - ANCHOR_GAP - popover.height;
  const top = clamp(rawTop, VIEWPORT_MARGIN, viewport.height - popover.height - VIEWPORT_MARGIN);
  const left = clamp(
    anchor.left,
    VIEWPORT_MARGIN,
    viewport.width - popover.width - VIEWPORT_MARGIN,
  );
  return { top, left, side };
}
