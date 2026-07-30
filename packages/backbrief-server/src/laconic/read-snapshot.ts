// Module: laconic/read-snapshot -- reads ~/.laconic/concepts/*.md and
// produces the calibration snapshot the state digest surfaces.
//
// Implements kb/spec/laconic-bridge.md#read: parse each concept file's
// frontmatter (id, state, domain), keep only verified/familiar (exposed/
// unknown have nothing to omit, so they are not even collected). Reuses
// ../kb-frontmatter.ts's parser: its two supported shapes (`key: value`,
// `key: [a, b]`) already cover everything this needs -- id/state/domain are
// bare `key: value` lines in the concept schema, even though the same file
// also has a multi-line `evidence:` block this parser doesn't understand;
// those lines simply fail the key:value match and are skipped, exactly the
// tolerant behavior kb-frontmatter.ts's own header documents ("a malformed
// line is skipped, not fatal").
//
// fs access here is DELIBERATELY outside fsguard.ts's repo-root confinement
// -- laconic-bridge.md#the-boundary: `~/.laconic` is not the host repo,
// this read is the sanctioned exception (P3 governs writes to the REPO;
// this never touches the repo at all). Like digest.ts/telemetry.ts's own
// documented fs exceptions (code-style.md), this module imports
// `node:fs/promises` directly rather than routing through a repo-scoped
// store -- there IS no repo-scoped store for a path that is, by design,
// never inside the repo.
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { parseKbFrontmatter } from "../kb-frontmatter";
import type { Config } from "../store/config";
import {
  isLaconicExplicitlyDisabled,
  laconicConceptsDir,
  resolveLaconicHome,
  type LaconicEnv,
} from "./home";

export interface LaconicConceptRef {
  id: string;
  domain: string;
}

export interface LaconicSnapshot {
  verified: LaconicConceptRef[];
  familiar: LaconicConceptRef[];
}

/**
 * @param homedir the caller's `os.homedir()` (DI, home.ts's module header)
 * @returns `null` if the bridge is off (explicitly disabled, or no
 *   `<home>/concepts/` dir -- laconic-bridge.md: "bridge fully off, like
 *   no-KB mode"); a snapshot of the user's verified/familiar portable
 *   concepts otherwise.
 * @invariant every error degrades to `null`, never throws --
 *   laconic-bridge.md#failure-honesty: "any bridge error is swallowed and
 *   logged; it must never break or delay a session."
 */
export async function readLaconicSnapshot(
  config: Config,
  env: LaconicEnv,
  homedir: string,
): Promise<LaconicSnapshot | null> {
  if (isLaconicExplicitlyDisabled(config)) return null;
  const conceptsDir = laconicConceptsDir(resolveLaconicHome(config, env, homedir));

  let files: string[];
  try {
    files = (await fs.readdir(conceptsDir)).filter((f) => f.endsWith(".md"));
  } catch {
    return null; // no concepts/ dir (or unreadable) -- bridge off, "like no-KB mode"
  }

  const verified: LaconicConceptRef[] = [];
  const familiar: LaconicConceptRef[] = [];
  for (const file of files) {
    const concept = await readOneConcept(path.join(conceptsDir, file));
    if (!concept) continue; // one malformed file must not sink the whole snapshot
    if (concept.state === "verified") verified.push({ id: concept.id, domain: concept.domain });
    else if (concept.state === "familiar")
      familiar.push({ id: concept.id, domain: concept.domain });
    // exposed/unknown: laconic-bridge.md "NOT surfaced (nothing to omit)".
  }
  return { verified, familiar };
}

interface ParsedConcept {
  id: string;
  domain: string;
  state: string;
}

/** @returns `null` on any read/parse failure OR a missing required field -- a graceful per-file skip, not a thrown error (module header). */
async function readOneConcept(filePath: string): Promise<ParsedConcept | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const { frontmatter } = parseKbFrontmatter(raw);
    const { id, domain, state } = frontmatter;
    if (typeof id !== "string" || typeof domain !== "string" || typeof state !== "string") {
      return null;
    }
    return { id, domain, state };
  } catch {
    return null;
  }
}
