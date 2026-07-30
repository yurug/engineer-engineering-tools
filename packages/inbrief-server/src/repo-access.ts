// Module: repo-access -- inbrief's implementation of @brief/core's
// CitationRepoAccess and CitationKbAccess.
//
// Deliberately the same narrow shape forebrief uses: citation minting and
// validation only ever call readAtRev/readFile, so there is nothing to gain
// from a wider interface, and a wider one would tempt callers to read the host
// repository through the citation path for unrelated reasons.
//
// @invariant P1 -- this is the ONLY place inbrief resolves citation content
//   from disk or git. Nothing else in the server touches fs or child_process
//   to answer "what is at this line".
// @invariant P8's neighbour: containment. A citation path is repo-relative and
//   must stay inside the repository. A path that escapes returns null, which
//   renders as a failed citation rather than as an error, because a crafted
//   path is an ordinary hostile input and not an exceptional condition.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { CitationRepoAccess, CitationKbAccess } from "@brief/core";

const execFileAsync = promisify(execFile);

/** Every git call gets a timeout: a hung git must surface as a failed citation, never as a hung session. */
const GIT_TIMEOUT_MS = 10_000;

/**
 * @param repoRoot absolute path to the project being taught
 * @returns core's citation-reading interface over that project
 */
export function makeRepoAccess(repoRoot: string): CitationRepoAccess {
  return {
    async readAtRev(rev, relPath) {
      if (rev === "worktree") return readWorktreeFile(repoRoot, relPath);
      return readAtGitRev(repoRoot, rev, relPath);
    },
  };
}

/** KB citations resolve against the worktree only: a knowledge-base file is read as it stands now. */
export function makeKbAccess(repoRoot: string): CitationKbAccess {
  return { readFile: (relPath) => readWorktreeFile(repoRoot, relPath) };
}

async function readWorktreeFile(repoRoot: string, relPath: string): Promise<string | null> {
  const root = path.resolve(repoRoot);
  const absolute = path.resolve(root, relPath);
  // WHY the separator: a prefix check without it lets "/repo-evil" pass as
  // being inside "/repo".
  if (absolute !== root && !absolute.startsWith(root + path.sep)) return null;
  try {
    const stat = await fs.stat(absolute);
    if (!stat.isFile()) return null;
    return await fs.readFile(absolute, "utf8");
  } catch {
    return null; // a missing file is an expected outcome, never a throw
  }
}

async function readAtGitRev(
  repoRoot: string,
  rev: string,
  relPath: string,
): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["show", `${rev}:${relPath}`], {
      cwd: repoRoot,
      maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env, LC_ALL: "C" },
      timeout: GIT_TIMEOUT_MS,
    });
    return stdout;
  } catch {
    return null;
  }
}
