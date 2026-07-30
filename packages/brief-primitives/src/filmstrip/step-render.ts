// Module: filmstrip/step-render -- applies one step's typed deltas
// (reveal/conceal/emphasize/dim/relabel, ADR-010) to the ONE pinned base
// layout (./layout.ts), producing that step's full SVG.
//
// @invariant PR1 -- this module only ever ADDS a `style` attribute to a
// node/edge's <g> opening tag (visibility/emphasis) or SWAPS a <text>
// element's inner CONTENT (relabel). It never touches a polygon/path/
// ellipse coordinate, a <text>'s x/y, or any <g> transform attribute --
// those bytes are copied through unchanged from `pinnedSvg`, which is why
// an element visible in two steps has byte-identical geometry in both.
import { escapeXmlText } from "../svg-utils.js";
import { TOKENS } from "../tokens.js";
import type { FilmstripStep } from "./spec.js";

// Graphviz emits one non-nested <g id="nodeN"|"edgeN" class="node"|"edge">
// block per element, each starting with a <title> naming it
// (https://graphviz.org/doc/info/output.html#d:svg) -- non-nested, so a
// non-greedy match up to the first </g> is exactly one element's block.
const ELEMENT_BLOCK_RE = /<g id="(?:node|edge)\d+" class="(?:node|edge)">([\s\S]*?)<\/g>/g;

function decodeGraphvizTitle(raw: string): string {
  return raw
    .replace(/&#45;/g, "-")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

/** @returns the element's logical id (a node's own id, or `${from}->${to}`
 *  for an edge -- see ./spec.ts's `edgeId`), read from its `<title>`. */
function titleOf(blockContent: string): string | null {
  const match = /<title>([^<]*)<\/title>/.exec(blockContent);
  return match ? decodeGraphvizTitle(match[1]!) : null;
}

/** @returns a CSS `style` value if `id` must be hidden or dimmed this
 *  step, or `null` for full-weight/no override. Hidden takes precedence
 *  over dimmed -- an element absent from `show` is invisible regardless
 *  of whether it's also absent from `emphasize`. */
function elementStyle(id: string, step: FilmstripStep): string | null {
  if (step.show && !step.show.includes(id)) return "display:none";
  if (step.emphasize && step.emphasize.length > 0 && !step.emphasize.includes(id)) {
    return `opacity:${String(TOKENS.opacity.dimmed)}`;
  }
  return null;
}

/** Replaces the FIRST `<text>...</text>` element's content within one
 *  element's block -- the label line. A node's second `<text>` (its
 *  note) is never touched: ADR-010 treats a note as structural, not a
 *  step-overridable field. No-op (returns `blockContent` unchanged) if
 *  the block has no `<text>` at all (an unlabeled edge). */
function withRelabeledText(blockContent: string, newText: string): string {
  return blockContent.replace(
    /(<text\b[^>]*>)([^<]*)(<\/text>)/,
    (_whole, open: string, _old: string, close: string) =>
      `${open}${escapeXmlText(newText)}${close}`,
  );
}

/**
 * @param pinnedSvg the ONE base layout every step derives from
 *   (./layout.ts) -- never re-laid-out.
 * @param step this step's deltas.
 * @param textForId id -> the text this step actually displays: its own
 *   `labels` override, or the id's true base label/edge-label when not
 *   overridden. NOT the placeholder widest text baked into `pinnedSvg` --
 *   swapping that placeholder out for this map's text is this function's
 *   whole job.
 */
export function renderFilmstripStep(
  pinnedSvg: string,
  step: FilmstripStep,
  textForId: ReadonlyMap<string, string>,
): string {
  return pinnedSvg.replace(ELEMENT_BLOCK_RE, (whole: string, content: string) => {
    const id = titleOf(content);
    if (id === null) return whole;
    const style = elementStyle(id, step);
    const openTagEnd = whole.indexOf(">");
    const openTag = whole.slice(0, openTagEnd);
    const styledOpenTag = style ? `${openTag} style="${style}"` : openTag;
    const newText = textForId.get(id);
    const newContent = newText === undefined ? content : withRelabeledText(content, newText);
    return `${styledOpenTag}>${newContent}</g>`;
  });
}
