// Module: filmstrip/label-width -- ADR-010's box-pinning mechanism:
// "node boxes are sized from the widest label any step assigns to them,
// pinned from the base layout" (kb/primitives/spec.md#2-filmstrip).
//
// Implemented by MEASURING every label candidate's real rendered width
// with Graphviz itself -- the same font-metric engine the real layout
// uses -- rather than approximating by character count (unsafe for
// variable-width fonts: "WWWW" has fewer characters than "iiiiiiii" but
// is far wider). The widest candidate's TEXT is then substituted as the
// PRODUCTION label for that id, so the one real layout call (./layout.ts)
// sizes every box correctly using Graphviz's own metrics -- no guessing,
// and no separate "would this overflow" check needed: since every id's
// production label IS the widest of its own candidates, no candidate can
// ever be wider than the box Graphviz drew for it.
import { escapeDotString, NODE_STYLE_ATTRS } from "../diagram/dot.js";
import { layoutDot } from "../diagram/graphviz-instance.js";
import type { DiagramBody } from "../diagram/spec.js";
import type { FilmstripStep } from "./spec.js";
import { edgeId } from "./spec.js";

/** id -> every distinct candidate text that id might display, across the
 *  base and every step (base's own label/edge-label counts as a
 *  candidate too, even when no step ever overrides it). */
function collectCandidatesById(
  base: Pick<DiagramBody, "nodes" | "edges">,
  steps: readonly FilmstripStep[],
): Map<string, string[]> {
  const byId = new Map<string, string[]>();
  const add = (id: string, text: string): void => {
    const existing = byId.get(id) ?? [];
    if (!existing.includes(text)) existing.push(text);
    byId.set(id, existing);
  };
  for (const node of base.nodes) add(node.id, node.label);
  for (const edge of base.edges) if (edge.label) add(edgeId(edge), edge.label);
  for (const step of steps) {
    for (const [id, text] of Object.entries(step.labels ?? {})) add(id, text);
  }
  return byId;
}

interface MeasuredCandidate {
  id: string;
  text: string;
  width: number;
}

/** Reads back the box width Graphviz drew for the node titled `measureName`.
 *
 *  Reads BOTH shapes Graphviz can emit for a box, because which one it uses
 *  depends on a style attribute this function does not control: a plain box is
 *  a `<polygon points="...">`, a rounded one is a `<path d="...">`. Adding
 *  `style=rounded` to the shared node attrs broke this the moment it landed,
 *  and the filmstrip stress test caught it — parsing one shape was an
 *  assumption about presentation living inside a measurement. */
function nodeBoxWidth(svg: string, measureName: string): number {
  const block = new RegExp(
    `<title>${measureName}</title>[\\s\\S]*?(?:points="([^"]+)"|\\sd="([^"]+)")`,
  ).exec(svg);
  if (!block) throw new Error(`measurement node "${measureName}" not found in Graphviz output`);
  const geometry = block[1] ?? block[2]!;
  // Every x coordinate in either form: "x,y" pairs in a polygon, and the same
  // pairs interleaved with path commands (M/C/L) in a path.
  const xs = [...geometry.matchAll(/(-?[\d.]+),-?[\d.]+/g)].map((m) => Number(m[1]));
  if (xs.length === 0) {
    throw new Error(`measurement node "${measureName}" has no readable geometry`);
  }
  return Math.max(...xs) - Math.min(...xs);
}

/** Renders one throwaway graph with one disconnected node per (id, text)
 *  candidate pair -- using the SAME node style attrs ./diagram/dot.ts
 *  uses for real -- and reads back each candidate's true rendered box
 *  width. One Graphviz call measures every candidate a filmstrip will
 *  ever need, however many ids or steps are involved. */
async function measureCandidateWidths(
  byId: ReadonlyMap<string, readonly string[]>,
): Promise<MeasuredCandidate[]> {
  const flat: { id: string; text: string; measureName: string }[] = [];
  let n = 0;
  for (const [id, texts] of byId) {
    for (const text of texts) {
      flat.push({ id, text, measureName: `m${String(n)}` });
      n += 1;
    }
  }
  if (flat.length === 0) return [];
  const dotLines = ["digraph Measure {", `  node [${NODE_STYLE_ATTRS}];`];
  for (const { measureName, text } of flat) {
    dotLines.push(`  "${measureName}" [label="${escapeDotString(text)}"];`);
  }
  dotLines.push("}");
  const svg = await layoutDot(dotLines.join("\n"), "dot");
  return flat.map(({ id, text, measureName }) => ({
    id,
    text,
    width: nodeBoxWidth(svg, measureName),
  }));
}

export interface PinnedLabels {
  /** id -> the widest candidate text -- the text actually written into
   *  the production layout body for that id (./layout.ts). */
  widestTextById: Map<string, string>;
}

/**
 * @param base the filmstrip's base graph (nodes/edges only).
 * @param steps every step, for their `labels` overrides.
 * @invariant ADR-010/PR1 -- an id with only ONE candidate (no step ever
 *   overrides it) is returned unchanged with no measurement call, so a
 *   filmstrip with no relabeling costs nothing beyond a plain diagram render.
 */
export async function pinWidestLabels(
  base: Pick<DiagramBody, "nodes" | "edges">,
  steps: readonly FilmstripStep[],
): Promise<PinnedLabels> {
  const byId = collectCandidatesById(base, steps);
  const widestTextById = new Map<string, string>();
  const toMeasure = new Map<string, readonly string[]>();
  for (const [id, texts] of byId) {
    if (texts.length === 1) widestTextById.set(id, texts[0]!);
    else toMeasure.set(id, texts);
  }
  const measured = await measureCandidateWidths(toMeasure);
  const widestSoFar = new Map<string, MeasuredCandidate>();
  for (const candidate of measured) {
    const current = widestSoFar.get(candidate.id);
    if (!current || candidate.width > current.width) widestSoFar.set(candidate.id, candidate);
  }
  for (const [id, candidate] of widestSoFar) widestTextById.set(id, candidate.text);
  return { widestTextById };
}
