// Module: session/knowledge-model -- reading what this engineer already knows.
//
// laconic maintains a project-independent record of concepts and how well the
// engineer holds each, built from what they DID: questions asked, corrections
// made, unprompted correct use. inbrief reads it to subtract (P2) and never
// writes it by hand (P4): writes go through laconic's own recording tool, which
// owns the schema, the index and the commit.
//
// @invariant read-only, and tolerant. A missing home, an unreadable file or a
//   file with no frontmatter each yield "nothing known" rather than an error.
//   An engineer with no knowledge model should get a full session, which is the
//   correct outcome, not a failure to start.
import * as fs from "node:fs/promises";
import * as path from "node:path";

/** laconic's four states, weakest to strongest. */
export type ConceptState = "unknown" | "exposed" | "familiar" | "verified";

/**
 * States that count as "this engineer holds it" for subtraction.
 *
 * `familiar` is included and `exposed` is not, and the line is laconic's own:
 * familiar means a short gloss suffices, exposed means they have seen the term
 * and nothing more. Teaching a familiar concept wastes their time; skipping an
 * exposed one leaves a hole.
 */
const HELD: ReadonlySet<string> = new Set(["familiar", "verified"]);

export type KnowledgeModel = ReadonlyMap<string, string>;

/**
 * @param laconicHome the store's root, normally `~/.laconic`
 * @returns concept id to state, empty when the store is absent
 */
export async function readKnowledgeModel(laconicHome: string): Promise<Map<string, string>> {
  const dir = path.join(laconicHome, "concepts");
  const model = new Map<string, string>();
  let names: string[];
  try {
    names = (await fs.readdir(dir)).filter((n) => n.endsWith(".md"));
  } catch {
    return model; // no store: nothing known, full session
  }

  for (const name of names) {
    try {
      const parsed = parseConcept(await fs.readFile(path.join(dir, name), "utf8"));
      if (parsed) model.set(parsed.id, parsed.state);
    } catch {
      continue; // one unreadable file must not cost the whole model
    }
  }
  return model;
}

/** @returns whether the model says this engineer already holds `conceptId`. */
export function holds(model: KnowledgeModel, conceptId: string): boolean {
  const state = model.get(conceptId);
  return state !== undefined && HELD.has(state);
}

/**
 * @returns the id and state from a concept file's frontmatter, or null
 * @invariant deliberately not a YAML parser. Two flat keys are needed and a
 *   dependency to read them would be a dependency to keep in step with
 *   laconic's schema. A file this does not understand is skipped, which is the
 *   same outcome as a concept that does not exist: not taught about, not
 *   crashed on.
 */
function parseConcept(content: string): { id: string; state: string } | null {
  const id = /^id:\s*(\S+)\s*$/m.exec(content)?.[1];
  const state = /^state:\s*(\S+)\s*$/m.exec(content)?.[1];
  return id !== undefined && state !== undefined ? { id, state } : null;
}
