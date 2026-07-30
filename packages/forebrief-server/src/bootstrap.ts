// Module: bootstrap -- first-run setup of `.forebrief/`.
//
// kb/spec/config-and-formats.md: ".gitignore -- written on first run:
// server.json, server.lock, server.log, .serve-error.json, last-port" --
// ONLY those five runtime artifacts. Everything else under `.forebrief/`
// (decisions.jsonl, config.json, rounds/, digest.md) is git-tracked
// deliberately (decisions are provenance) -- the opposite of backbrief's
// wholly-ephemeral `.backbrief/`; this file must NOT copy that pattern.
// `last-port` added by ADR-006 (recovery rebinds the last-used port): it is
// per-MACHINE runtime state, same posture as server.json/server.lock, never
// provenance to track.
// Idempotent -- safe to call on every `serve` startup.
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { resolveForebriefPath } from "./fsguard";

const GITIGNORE_CONTENT = "server.json\nserver.lock\nserver.log\n.serve-error.json\nlast-port\n";

/** @invariant P3 the written path is itself resolved through fsguard. */
export async function ensureForebriefGitignore(repoRoot: string): Promise<void> {
  const filePath = resolveForebriefPath(repoRoot, ".gitignore");
  try {
    await fs.access(filePath);
    return; // already present -- never overwrite a file the user might have hand-edited
  } catch {
    // ENOENT expected -- fall through and create it.
  }
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, GITIGNORE_CONTENT, "utf8");
}
