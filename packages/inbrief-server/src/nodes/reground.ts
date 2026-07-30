// Module: nodes/reground -- re-validating a stored node's citations every time
// the session is read.
//
// P1's least obvious clause is "at render time". Intake proves a citation
// resolved when the node was admitted; this proves it still resolves now. The
// difference matters because code moves: a node admitted last Tuesday whose
// cited lines have since been rewritten is no longer grounded, and showing it as
// grounded would be presenting a stale claim as truth.
//
// @invariant P1 -- the verdict is COMPUTED on every read and never stored. A
//   stored verdict is a cached truth about a file that can change without
//   telling anyone, which is exactly the thing this guards against.
import {
  validateCodeCitation,
  validateKbCitation,
  type CitationKbAccess,
  type CitationRepoAccess,
} from "@brief/core";
import type { Citation } from "@brief/shared";
import type { StoredNode } from "../types/node";

/**
 * How a claim stands right now.
 *
 * `conjecture` is the honest name for "we cannot currently confirm this", and it
 * is deliberately not called "invalid": the citation may be perfectly correct
 * about a file that simply moved, and the reader needs to know we cannot vouch
 * for it, not that it is false.
 */
export type Grounding =
  | { kind: "grounded"; citation: Citation; excerpt: string[] }
  | { kind: "conjecture"; citation: Citation; reason: string; excerpt: string[] };

/**
 * How many lines of a citation the server will hand to the browser.
 *
 * A bound rather than a preference: P5 makes attention the server's business,
 * and a node citing four hundred lines has stopped citing and started pasting.
 * Truncation is visible in the UI rather than silent.
 */
export const MAX_EXCERPT_LINES = 40;

export interface GroundedNode extends StoredNode {
  /** One entry per citation, in the node's own citation order. */
  grounding: Grounding[];
}

export interface RegroundDeps {
  repo: CitationRepoAccess;
  kb: CitationKbAccess;
}

/** @returns the node with a freshly computed verdict per citation. */
export async function regroundNode(node: StoredNode, deps: RegroundDeps): Promise<GroundedNode> {
  const grounding = await Promise.all(
    node.citations.map(async (citation): Promise<Grounding> => {
      const result =
        citation.kind === "code"
          ? await validateCodeCitation(citation, deps.repo)
          : await validateKbCitation(citation, deps.kb);
      // `drifted` counts as grounded: core repaired the range and the content is
      // the same text, so the claim still points at what it claimed. Only
      // `broken` means we cannot vouch for it.
      // The excerpt is what is at those lines NOW, which is the only thing that
      // can be shown. For a broken citation that is precisely the useful thing:
      // the reader sees what replaced the claim rather than an assertion that
      // something is wrong.
      const excerpt = await readExcerpt(result.citation, deps);
      if (result.state === "broken") {
        return {
          kind: "conjecture",
          citation: result.citation,
          reason: result.reason ?? "citation no longer resolves",
          excerpt,
        };
      }
      return { kind: "grounded", citation: result.citation, excerpt };
    }),
  );
  return { ...node, grounding };
}

/**
 * @returns the cited lines, capped, or an empty list when they cannot be read
 * @invariant reads ONLY through the same repo access the citation validator
 *   uses, which is confined to the repository. There is deliberately no endpoint
 *   taking a path from the caller: content is served for citations already in
 *   the map, so nothing here can be turned into a file-read primitive.
 */
async function readExcerpt(citation: Citation, deps: RegroundDeps): Promise<string[]> {
  const content =
    citation.kind === "code"
      ? await deps.repo.readAtRev(citation.rev, citation.path)
      : await deps.kb.readFile(citation.path);
  if (content === null) return [];

  const lines = content.split(/\r\n|\r|\n/);
  if (citation.kind !== "code") return lines.slice(0, MAX_EXCERPT_LINES);

  // Citation line numbers are 1-based and inclusive.
  const from = Math.max(citation.startLine - 1, 0);
  const to = Math.min(citation.endLine, lines.length);
  return lines.slice(from, Math.min(to, from + MAX_EXCERPT_LINES));
}
