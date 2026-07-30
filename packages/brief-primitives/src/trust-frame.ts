// Module: trust-frame -- the substrate-agnostic outer frame ADR-011
// decided: solid = grounded, dashed + corner tag = conjecture. Wraps ANY
// rendered SVG visual (Graphviz diagram/filmstrip today; a future Vega
// chart substrate reuses the same function unchanged, per ADR-011's "ships
// the uniform language first"). Renderers do not style their own internals
// by trust in this step -- ADR-011's per-element exception is deferred to
// the matrix renderer (step 2, built DOM, cheap to mark per-cell).
import { svgBody, svgDimensions } from "./svg-utils.js";
import { TOKENS } from "./tokens.js";
import type { Trust } from "./envelope.js";

export interface TrustFrameOptions {
  /** @default TOKENS.space.frameInset */
  inset?: number;
  /** Which primitive produced the inner SVG, stamped as provenance on the
   *  frame. Found missing the first time a real artifact embedded a rendered
   *  visual: the output was indistinguishable from hand-rolled markup, so the
   *  adoption metric counted a spec-rendered diagram as improvised. A visual
   *  that cannot say where it came from cannot be told apart from one that
   *  came from nowhere. */
  primitive?: string;
  /** The schema version the spec validated against. */
  schemaVersion?: string;
  /**
   * Draw the trust CHROME (the rect, and the corner tag on a conjecture).
   * `false` keeps the wrapper, the `data-trust` attribute and the
   * provenance stamp, and omits only the marks a reader sees.
   *
   * @default true
   *
   * Exists for ONE caller: a claim card whose evidence is an SVG primitive
   * at the SAME trust as the card itself (../claim/dispatch.ts). There the
   * inner frame is a second rectangle and a second CONJECTURE tag saying
   * what the card's own frame already says, and P-D deletes an element
   * that carries no information. It stays for a matrix (whose per-cell
   * marks the outer frame cannot reproduce) and for evidence whose trust
   * DIFFERS from the card's -- a grounded chart inside a conjecture card
   * keeps its solid frame, because "this drawing is verified even though
   * the card is not" is true and worth drawing.
   *
   * Trust chrome and provenance are separable concerns that happened to
   * ship together: dropping the stamp along with the rect would recreate
   * exactly the blind spot PR8b was written about, where a visual that
   * cannot say where it came from is indistinguishable from hand-rolled
   * markup.
   */
  chrome?: boolean;
}

/** What a renderer accepts on behalf of whoever is EMBEDDING its output:
 *  the frame decision belongs to the composition, not to the primitive.
 *  Deliberately a subset of `TrustFrameOptions` -- a caller may suppress
 *  the chrome, never the provenance stamp. */
export type EmbedOptions = Pick<TrustFrameOptions, "chrome">;

/**
 * @param innerSvg a complete SVG document (Graphviz's output today, or any
 *   future substrate emitting one). Its content is nested inside a child
 *   `<svg>` viewport, untouched -- every coordinate/transform attribute
 *   inside it survives byte-for-byte (PR1: framing never triggers a
 *   re-layout).
 * @param trust ADR-011: solid rect for "grounded"; dashed rect plus a
 *   corner tag reading "CONJECTURE" for "conjecture".
 * @returns a new, complete, standalone SVG document.
 * @invariant PR3 -- the frame is the ONLY thing that communicates trust;
 *   callers must pass the visual's weakest claim (kb/primitives/spec.md's
 *   "a visual mixing validated and predicted claims takes the weakest").
 */
export function wrapWithTrustFrame(
  innerSvg: string,
  trust: Trust,
  options: TrustFrameOptions = {},
): string {
  const chrome = options.chrome ?? true;
  // No chrome, no inset: the inset is breathing room for a border that is
  // not being drawn, and the embedding card supplies its own padding.
  const inset = options.inset ?? (chrome ? TOKENS.space.frameInset : 0);
  const { width, height } = svgDimensions(innerSvg);
  const body = svgBody(innerSvg);
  const outerWidth = width + inset * 2;
  const outerHeight = height + inset * 2;
  const strokeWidth = TOKENS.stroke.frameWidth;
  const isConjecture = trust === "conjecture" && chrome;
  const dashAttr = isConjecture ? ` stroke-dasharray="${TOKENS.stroke.frameDash}"` : "";
  const frameColor = isConjecture ? TOKENS.color.conjecture : TOKENS.color.ink;
  const provenanceAttrs = options.primitive
    ? ` data-primitive="${options.primitive}"${options.schemaVersion ? ` data-primitives-version="${options.schemaVersion}"` : ""}`
    : "";
  const provenanceComment = options.primitive
    ? `<!-- rendered by @brief/primitives from a validated ${options.primitive} spec -->`
    : "";
  const cornerTag = isConjecture
    ? `<text x="${outerWidth - TOKENS.space.frameCornerTagPadding}" y="${TOKENS.font.sizeTitle}" text-anchor="end" font-family="${TOKENS.font.family}" font-size="${TOKENS.font.size}" fill="${TOKENS.color.conjecture}">CONJECTURE</text>`
    : "";
  // `data-trust` is on the wrapper either way: a consumer inspecting the
  // markup still learns the trust level even when nothing draws it.
  const frameRect = chrome
    ? `<rect x="${strokeWidth / 2}" y="${strokeWidth / 2}" width="${outerWidth - strokeWidth}" height="${outerHeight - strokeWidth}" fill="none" stroke="${frameColor}" stroke-width="${strokeWidth}"${dashAttr}/>`
    : "";
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${outerWidth}pt" height="${outerHeight}pt" viewBox="0 0 ${outerWidth} ${outerHeight}" class="backbrief-trust-frame" data-trust="${trust}"${provenanceAttrs}>`,
    provenanceComment,
    frameRect,
    cornerTag,
    `<svg x="${inset}" y="${inset}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`,
    `</svg>`,
  ]
    .filter(Boolean)
    .join("\n");
}
