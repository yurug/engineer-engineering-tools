// Module: store/bootstrap -- first-run setup of `.backbrief/`.
//
// config-and-formats.md: "backbrief creates .backbrief/.gitignore
// containing server.json and server.lock on first run, so accidental
// commits of live state are impossible while everything else stays
// committable." Idempotent -- safe to call on every `serve` startup.
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { resolveBackbriefPath } from "../fsguard";

const GITIGNORE_CONTENT = "server.json\nserver.lock\n";

export async function ensureBackbriefGitignore(repoRoot: string): Promise<void> {
  const filePath = resolveBackbriefPath(repoRoot, ".gitignore");
  try {
    await fs.access(filePath);
    return; // already present -- never overwrite a file the user might have hand-edited
  } catch {
    // ENOENT expected -- fall through and create it.
  }
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, GITIGNORE_CONTENT, "utf8");
}
