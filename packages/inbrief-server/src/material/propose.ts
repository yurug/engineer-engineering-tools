// Module: material/propose -- rendering what a session learned back into the
// form a project keeps its teaching material in.
//
// @invariant P4 -- this WRITES NOTHING. It is a pure function returning
//   {path, content} pairs. inbrief does not write to a project's documentation;
//   the agent commits a proposal as an ordinary reviewable change, and the
//   engineer sees a diff rather than discovering a file that appeared.
// @invariant the round trip. `readMaterial(proposeMaterial(n)) == n` for every
//   field a file carries. Without that, enriching a project's material would
//   subtly rewrite what was already there, and the author would find their prose
//   came back different. There is a test for exactly this.
import type { Citation } from "@brief/shared";
import type { StoredNode } from "../types/node";
import { DEFAULT_MATERIAL_DIR } from "./config";

export interface Proposal {
  /** Repo-relative path the agent would commit this to. */
  path: string;
  content: string;
}

/**
 * @param nodes what the session learned that the project does not already carry
 * @param materialDir where this project keeps material, repository relative. The
 *   SAME value the reader used, or a session would propose into a directory it
 *   will not read back next time (ADR-029).
 * @returns one proposal per node, in the order given
 */
export function proposeMaterial(
  nodes: readonly StoredNode[],
  materialDir: string = DEFAULT_MATERIAL_DIR,
): Proposal[] {
  return nodes.map((node) => ({
    path: `${materialDir}/${node.id}.md`,
    content: render(node),
  }));
}

function render(node: StoredNode): string {
  const lines = [
    "---",
    `id: ${node.id}`,
    `mode: ${node.mode}`,
    `question: ${node.question}`,
    `requires: [${node.requires.join(", ")}]`,
    `introduces: [${node.introduces.join(", ")}]`,
    `uses: [${node.uses.join(", ")}]`,
    // Written explicitly even though only durable nodes are proposed: a file
    // that does not say would read back as a snapshot, so the round trip would
    // silently demote it.
    `lifetime: ${node.lifetime ?? "snapshot"}`,
  ];
  if (node.portableConcept) {
    lines.push(`portableConcept: ${node.portableConcept.id}@${node.portableConcept.domain}`);
  }
  lines.push("citations:");
  for (const citation of node.citations) lines.push(`  - ${reference(citation)}`);
  lines.push(
    "---",
    "```visual",
    JSON.stringify(node.visual.spec, null, 2),
    "```",
    "",
    node.answer,
    "",
  );
  return lines.join("\n");
}

/**
 * @returns `path:12-40`, or `path:12` when the range is one line
 * @invariant the rev and the content hash are DELIBERATELY absent. A person
 *   writing this file cannot know a hash, and a stale one committed into a
 *   project would be a claim the next reader has to disprove. The server mints
 *   both at intake, every time, from the file as it stands.
 */
function reference(citation: Citation): string {
  if (citation.kind !== "code") return citation.path;
  return citation.startLine === citation.endLine
    ? `${citation.path}:${String(citation.startLine)}`
    : `${citation.path}:${String(citation.startLine)}-${String(citation.endLine)}`;
}
