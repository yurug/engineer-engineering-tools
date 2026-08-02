// Module: nodes/terminology -- P9's pedagogical closure check.
//
// A valid prerequisite DAG is only an order. It becomes an onboarding order
// when the vocabulary a node assumes is supplied by that DAG. This module
// checks the declared vocabulary mechanically and leaves semantic discovery of
// undeclared jargon to the authoring audit documented by ADR-036.
import type { NodeSubmission, Refusal, StoredNode } from "../types/node";

type VocabularyNode = Pick<StoredNode, "id" | "requires" | "introduces">;

export function validateTerminology(
  candidate: NodeSubmission,
  existing: readonly StoredNode[],
): Refusal[] {
  if (!Array.isArray(candidate.introduces) || !Array.isArray(candidate.uses)) {
    return ["vocabulary-metadata-missing"];
  }

  const refusals: Refusal[] = [];
  const available = introducedByPrerequisites(candidate.requires, existing);

  for (const term of unique(candidate.uses)) {
    if (!available.has(normalize(term))) refusals.push(`term-unintroduced:${term}`);
    if (!containsTerm(`${candidate.question} ${candidate.answer}`, term)) {
      refusals.push(`used-term-missing-from-node:${term}`);
    }
  }

  for (const term of unique(candidate.introduces)) {
    if (containsTerm(candidate.question, term)) {
      refusals.push(`introduced-term-in-question:${term}`);
    }
    if (!containsTerm(candidate.answer, term)) {
      refusals.push(`introduced-term-missing-from-answer:${term}`);
    }
  }

  return refusals;
}

function introducedByPrerequisites(
  roots: readonly string[],
  existing: readonly VocabularyNode[],
): Set<string> {
  const byId = new Map(existing.map((node) => [node.id, node]));
  const seen = new Set<string>();
  const terms = new Set<string>();
  const pending = [...roots];
  while (pending.length > 0) {
    const id = pending.pop();
    if (id === undefined || seen.has(id)) continue;
    seen.add(id);
    const node = byId.get(id);
    if (!node) continue;
    // Old event logs predate P9. They remain readable evidence, but contribute
    // no vocabulary to a new node until migrated and re-admitted.
    for (const term of node.introduces ?? []) terms.add(normalize(term));
    pending.push(...node.requires);
  }
  return terms;
}

function containsTerm(text: string, term: string): boolean {
  return normalize(text).includes(normalize(term));
}

function normalize(value: string): string {
  return value
    .toLocaleLowerCase("en")
    .replace(/[`'"“”]/g, "")
    .replace(/[-_–—]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value !== ""))];
}
