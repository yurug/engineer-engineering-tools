// Module: material/read -- teaching material a project already carries.
//
// ADR-004: the material persists between sessions and may be written by an
// agent, a person, or both. ADR-007: it lives in the project's own
// documentation. This reads it.
//
// FORMAT, ratified 2026-07-29 (ADR-026). One markdown file per node,
// frontmatter for the fields, prose for the answer. Reasons:
//
// - The engineer already writes exactly this shape, in every knowledge base in
//   the family, and there is already a linter for it.
// - A node is a small self-contained claim, which is what a file is good at, and
//   an id is then a filename you can grep for.
// - Prose as the body means a person writes prose, not a quoted string in YAML.
//
// The alternative not chosen is one manifest listing every node, which would
// make ordering explicit and diffs noisier. This module stayed the only thing
// that would have to change, and now it is the thing people write files against:
// a shape change here breaks material somebody already committed.
//
// @invariant P6 -- a project with no material yields none, not an error. Never
//   taught is the ordinary case, and the session builds from what the agent
//   reads directly.
// @invariant material is used UNCHANGED. Not reflowed, not rewrapped, not
//   tidied. Reformatting someone's prose is how a tool teaches an author that it
//   does not respect their file.
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { CitationInput } from "@brief/shared";
import type { NodeMode, NodeSubmission } from "../types/node";
import { NODE_MODES } from "../types/node";
import { DEFAULT_MATERIAL_DIR } from "./config";

/**
 * @param repoRoot the project being taught
 * @param materialDir where this project keeps what it teaches, repository
 *   relative. Defaults to the ratified path for a project that states nothing
 *   (ADR-026); a project that states otherwise is honoured (ADR-029).
 * @returns every readable node, in filename order
 * @invariant filename order, not directory order, so two runs over the same
 *   material offer the same session. The agenda decides the teaching order
 *   (ADR-021); this only has to be deterministic.
 */
export async function readMaterial(
  repoRoot: string,
  materialDir: string = DEFAULT_MATERIAL_DIR,
): Promise<NodeSubmission[]> {
  const dir = path.join(repoRoot, materialDir);
  let names: string[];
  try {
    names = (await fs.readdir(dir)).filter((n) => n.endsWith(".md")).sort();
  } catch {
    return []; // never taught: ordinary, not exceptional
  }

  const nodes: NodeSubmission[] = [];
  for (const name of names) {
    try {
      const node = parseNode(await fs.readFile(path.join(dir, name), "utf8"));
      if (node) nodes.push(node);
    } catch {
      continue; // one unreadable file must not cost the whole map
    }
  }
  return nodes;
}

/**
 * @returns the node, or null when a required field is missing
 * @invariant a file missing a field is SKIPPED, never completed by guessing.
 *   Inventing a question or an id would put words in the author's mouth, and the
 *   node would then be taught as theirs.
 */
function parseNode(content: string): NodeSubmission | null {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(content);
  if (!match) return null;
  const [, frontmatter, body] = match;

  const field = (name: string): string | undefined =>
    new RegExp(`^${name}:\\s*(.+)$`, "m").exec(frontmatter ?? "")?.[1]?.trim();

  const id = field("id");
  const question = field("question");
  const mode = field("mode");
  const parsedBody = parseBody(body ?? "");
  const answer = parsedBody.answer;
  const citations = parseCitations(frontmatter ?? "");
  const introduces = field("introduces");
  const uses = field("uses");

  if (
    !id ||
    !question ||
    !mode ||
    answer === "" ||
    parsedBody.visual === null ||
    citations.length === 0 ||
    introduces === undefined ||
    uses === undefined
  )
    return null;
  if (!(NODE_MODES as readonly string[]).includes(mode)) return null;

  const portable = field("portableConcept");
  const lifetime = field("lifetime");
  return {
    id,
    mode: mode as NodeMode,
    question,
    answer,
    visual: parsedBody.visual,
    citations,
    requires: parseList(field("requires") ?? "[]"),
    introduces: parseList(introduces),
    uses: parseList(uses),
    // Absent means snapshot (DEFAULT_LIFETIME): an author who did not say has
    // not claimed this describes a design.
    lifetime: lifetime === "durable" ? "durable" : "snapshot",
    ...(portable ? { portableConcept: parsePortable(portable) } : {}),
  };
}

/** A git-reviewable spatial model, placed before prose so structure comes first. */
function parseBody(body: string): {
  visual: NodeSubmission["visual"] | null;
  answer: string;
} {
  const match = /^```visual\n([\s\S]*?)\n```\n+([\s\S]*)$/.exec(body.trim());
  if (!match) return { visual: null, answer: body.trim() };
  let visual: NodeSubmission["visual"];
  try {
    visual = JSON.parse(match[1]!) as NodeSubmission["visual"];
  } catch {
    return { visual: null, answer: match[2]!.trim() };
  }
  return {
    visual,
    answer: match[2]!.trim(),
  };
}

/**
 * Citations as a human types them: `path:12-40`, or `path:12` for one line.
 *
 * Deliberately not a JSON blob. An author writing a citation by hand should be
 * writing the form their editor and terminal already understand.
 */
function parseCitations(frontmatter: string): CitationInput[] {
  const block = /^citations:\s*\n((?:\s*-\s*.+\n?)*)/m.exec(frontmatter)?.[1] ?? "";
  const out: CitationInput[] = [];
  for (const line of block.split("\n")) {
    const raw = /^\s*-\s*(.+?)\s*$/.exec(line)?.[1];
    if (!raw) continue;
    const parsed = /^(.+?):(\d+)(?:-(\d+))?$/.exec(raw);
    if (!parsed) continue;
    const startLine = Number(parsed[2]);
    out.push({
      kind: "code",
      path: parsed[1]!,
      startLine,
      endLine: parsed[3] === undefined ? startLine : Number(parsed[3]),
    });
  }
  return out;
}

/** `[a, b]` or `[]`, the form the author already sees in KB frontmatter. */
function parseList(raw: string): string[] {
  const inner = /^\[(.*)\]$/.exec(raw.trim())?.[1] ?? "";
  return inner
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

/** `concept-id@domain`, one field rather than a nested object a human must indent. */
function parsePortable(raw: string): { id: string; domain: string } {
  const [id, domain] = raw.split("@");
  return { id: (id ?? raw).trim(), domain: (domain ?? "unknown").trim() };
}
