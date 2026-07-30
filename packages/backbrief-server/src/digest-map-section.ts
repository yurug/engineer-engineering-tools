// Module: digest-map-section -- renders the digest's "Comprehension map"
// section (v2, ADR-005).
//
// Split out of digest.ts (already near code-style.md's 200-line budget) --
// implements comprehension-map.md#read-api's digest requirement: "counts
// per state, the frontier list, and contested/invalidated nodes (NF5 cap
// still holds)." Reuses digest.ts's own `renderSection`/`collapseWhitespace`
// helpers (exported for this purpose) so NF5's per-section truncation
// behavior is identical everywhere, not reimplemented a second time.
import type { MapNode, MasteryState, OverlayEntry } from "@backbrief/shared";
import { collapseWhitespace, renderSection } from "./digest";

const MASTERY_STATES: readonly MasteryState[] = [
  "unseen",
  "introduced",
  "grasped",
  "demonstrated",
  "shaky",
  "contested",
  "invalidated",
];

/** @returns digest lines for the map section -- empty-map repos still render a (zeroed) section, never omit it, so the digest's shape is stable across sessions. */
export function renderComprehensionMapSection(
  nodes: readonly MapNode[],
  overlay: readonly OverlayEntry[],
  frontier: readonly string[],
): string[] {
  const stateById = new Map(overlay.map((e) => [e.nodeId, e.state]));
  const stateOf = (id: string): MasteryState => stateById.get(id) ?? "unseen";
  const counts = Object.fromEntries(MASTERY_STATES.map((s) => [s, 0])) as Record<
    MasteryState,
    number
  >;
  for (const node of nodes) counts[stateOf(node.id)] += 1;

  const contested = nodes.filter((n) => stateOf(n.id) === "contested");
  const invalidated = nodes.filter((n) => stateOf(n.id) === "invalidated");

  return [
    "## Comprehension map",
    "",
    MASTERY_STATES.map((s) => `${s}=${String(counts[s])}`).join(" "),
    "",
    `### Frontier (${String(frontier.length)})`,
    "",
    ...renderSection(frontier, (id) => `- ${id}`),
    "",
    `### Contested nodes (${String(contested.length)})`,
    "",
    ...renderSection(contested, (n) => `- [${n.id}] ${collapseWhitespace(n.question)}`),
    "",
    `### Invalidated nodes (${String(invalidated.length)})`,
    "",
    ...renderSection(invalidated, (n) => `- [${n.id}] ${collapseWhitespace(n.question)}`),
  ];
}
