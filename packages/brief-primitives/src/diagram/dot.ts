// Module: diagram/dot -- DiagramBody -> DOT-language source. The only
// place a label's text touches graph-description syntax; every other
// module deals in already-escaped strings or opaque SVG.
import { TOKENS } from "../tokens.js";
import type { DiagramBody, DiagramEdge, DiagramNode } from "./spec.js";
import type { GraphvizEngine } from "./engine-map.js";

/**
 * Escapes a label's raw text for use inside a DOT quoted string.
 *
 * @invariant PR2 -- backslashes are escaped FIRST so a literal backslash
 *   in a spec's label can never be reinterpreted as one of DOT's own
 *   escape sequences (`\n`/`\l`/`\r`) once concatenated with the `\n` this
 *   module inserts itself between a label and its note. Quotes are
 *   escaped so no label can close its quoted string early and inject a
 *   second DOT attribute (`label="x", shape=diamond` never becomes
 *   reachable from spec content).
 *
 * Exported for ../filmstrip/label-width.ts's measurement pass, which must
 * escape candidate label text identically to this file (a mismatch would
 * make measured widths disagree with what the real layout produces).
 */
export function escapeDotString(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** A DOT-quoted, escaped identifier -- used for both node ids (as the DOT
 *  node name) and any other opaque string that must survive untouched. */
function dotQuoted(text: string): string {
  return `"${escapeDotString(text)}"`;
}

/**
 * Node style attrs, shared verbatim with ../filmstrip/label-width.ts's
 * measurement pass -- MUST stay identical there, or a label's measured
 * width won't match the box Graphviz actually draws for that text in the
 * real layout, silently breaking ADR-010's box-pinning guarantee.
 */
/** Node presentation. Subtraction (P-D) removes decoration; it does not do the
 *  positive typographic work, and treating "not decorated" as "designed" is what
 *  made the first real diagrams read as stock Graphviz output: sharp corners,
 *  1.0-weight strokes heavier than their own labels, oversized arrowheads and
 *  no label padding. Every value here buys legibility, none buys ornament. */
export const NODE_STYLE_ATTRS = [
  "shape=box",
  "style=rounded",
  `margin="${String(TOKENS.space.nodePadX)},${String(TOKENS.space.nodePadY)}"`,
  `penwidth=${String(TOKENS.stroke.graphWidth)}`,
  `fontname="${TOKENS.font.family}"`,
  `fontsize=${String(TOKENS.font.size)}`,
  // The box is furniture, the text is content: the border sits back a step.
  `color="${TOKENS.color.border}"`,
  `fontcolor="${TOKENS.color.ink}"`,
].join(" ");

/** @returns the label DOT source for one node: its `label`, plus its
 *  `note` beneath it (P-C) via DOT's own center-justified linebreak
 *  escape -- inserted by this function, never taken from spec content. */
function nodeLabelSource(node: DiagramNode): string {
  const label = escapeDotString(node.label);
  return node.note ? `${label}\\n${escapeDotString(node.note)}` : label;
}

/** @returns one DOT statement declaring `node`, with its (possibly
 *  two-line) label. */
function renderNodeStatement(node: DiagramNode): string {
  return `  ${dotQuoted(node.id)} [label="${nodeLabelSource(node)}"];`;
}

/** @returns one DOT statement declaring `edge`, its label riding the edge
 *  (P-C) via DOT's own `label` attribute -- never a separate legend node. */
function renderEdgeStatement(edge: DiagramEdge): string {
  const attrs: string[] = [];
  if (edge.label) attrs.push(`label="${escapeDotString(edge.label)}"`);
  if (edge.style === "dashed") attrs.push("style=dashed");
  const attrSuffix = attrs.length > 0 ? ` [${attrs.join(" ")}]` : "";
  return `  ${dotQuoted(edge.from)} -> ${dotQuoted(edge.to)}${attrSuffix};`;
}

/**
 * @param body a validated `DiagramBody` (or the equivalent fields of a
 *   full `DiagramSpec`) -- `checkEdgeNodeIds` (./spec.ts) has already
 *   guaranteed every edge's endpoints exist, so this function never needs
 *   to re-check.
 * @param engine ADR-013's chosen engine for `body.meaning` -- used here
 *   only to decide whether `rankdir=LR` helps (a `dot`-family hint;
 *   force-directed engines ignore it harmlessly), never embedded as a
 *   spec-controlled value.
 */
export function buildDot(
  body: Pick<DiagramBody, "meaning" | "nodes" | "edges">,
  engine: GraphvizEngine,
): string {
  const lines: string[] = ["digraph G {"];
  lines.push(`  fontname="${TOKENS.font.family}";`);
  lines.push(`  ranksep=${String(TOKENS.space.rankSepInches)};`);
  lines.push(`  nodesep=${String(TOKENS.space.nodeSepInches)};`);
  lines.push(`  node [${NODE_STYLE_ATTRS}];`);
  lines.push(
    // An edge label annotates a relation: smaller and muted than the things it
    // joins (P-C keeps it ON the edge; this keeps it from shouting).
    `  edge [fontname="${TOKENS.font.family}" fontsize=${String(TOKENS.font.sizeEdgeLabel)} ` +
      `color="${TOKENS.color.inkMuted}" fontcolor="${TOKENS.color.inkMuted}" ` +
      `penwidth=${String(TOKENS.stroke.graphWidth)} arrowsize=${String(TOKENS.stroke.arrowScale)}];`,
  );
  // A causal chain reads left-to-right; every other meaning keeps
  // Graphviz's default top-to-bottom rank order.
  if (engine === "dot" && body.meaning === "causal-chain")
    lines.push("  rankdir=LR;");
  for (const node of body.nodes) lines.push(renderNodeStatement(node));
  for (const edge of body.edges) lines.push(renderEdgeStatement(edge));
  lines.push("}");
  return lines.join("\n");
}
