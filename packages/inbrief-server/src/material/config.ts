// Module: material/config -- the per-project settings a repository states for
// itself, read from `.inbrief/config.json`.
//
// ADR-026 ratified `doc/onboarding` as the material path with no way to change
// it, and tezqed was the first project to disagree: it keeps prose in `docs/`
// and `kb/`, so proposing into `doc/` would open a third documentation root
// because a tool would not bend (ADR-029).
//
// The shape follows forebrief's `.forebrief/config.json`, which is tracked in
// git and carries exactly this kind of setting (`adrDir`, `roundsDir`). One
// convention across the family, so an engineer configures the third tool the way
// they configured the first two.
//
// @invariant a malformed config is FATAL, never silently defaulted. The cost of
//   guessing is material proposed into a directory the project does not use,
//   which is discovered by a reviewer wondering what this new folder is.
import * as fs from "node:fs/promises";
import * as path from "node:path";

/** Where material lives when a project says nothing (ADR-026). */
export const DEFAULT_MATERIAL_DIR = "doc/onboarding";

export interface ProjectConfig {
  /** Repository-relative directory holding one markdown file per node. */
  materialDir: string;
}

/**
 * @param repoRoot the project being taught
 * @returns its stated configuration, or the defaults when it states none
 * @throws when the file exists and cannot be trusted
 */
export async function readProjectConfig(repoRoot: string): Promise<ProjectConfig> {
  const file = path.join(repoRoot, ".inbrief", "config.json");
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch {
    return { materialDir: DEFAULT_MATERIAL_DIR }; // no config is the ordinary case
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`.inbrief/config.json is not valid JSON`);
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`.inbrief/config.json must contain an object`);
  }

  const stated = (parsed as { materialDir?: unknown }).materialDir;
  if (stated === undefined) return { materialDir: DEFAULT_MATERIAL_DIR };
  if (typeof stated !== "string" || stated.trim() === "") {
    throw new Error(`.inbrief/config.json: materialDir must be a non-empty string`);
  }
  return { materialDir: assertInsideRepo(stated) };
}

/**
 * @invariant P4 -- the material directory is repository-relative and stays
 *   inside the repository. An absolute path or one climbing out of the tree
 *   would let a config file aim proposals at somewhere nobody reviewing this
 *   project would look, which is the boundary the write rules exist to hold.
 */
function assertInsideRepo(dir: string): string {
  const normalized = path.normalize(dir);
  if (path.isAbsolute(normalized) || normalized.split(path.sep).includes("..")) {
    throw new Error(`.inbrief/config.json: materialDir must stay inside the repository`);
  }
  return normalized;
}
