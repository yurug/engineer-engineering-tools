// Module: repo-access -- forebrief's own (minimal) implementations of
// @brief/core's CitationRepoAccess and CitationKbAccess.
//
// kb/external/backbrief-internals.md: these interfaces are deliberately
// narrow ("citation minting/validation only ever calls
// readAtRev/readFile") -- backbrief's fuller RepoAccess/KbAccess satisfy
// them structurally, but forebrief has no equivalent wide interface to
// reuse, so this file supplies the two functions directly rather than
// pulling in anything backbrief-domain (repo-tree, diff).
// @invariant P1/P10 -- this is the ONLY place forebrief resolves citation
//   content from disk/git; render/ground.ts and the round/record routes
//   consume it, never touching fs/child_process themselves.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { CitationRepoAccess, CitationKbAccess } from "@brief/core";
import { isUnderForebrief } from "./fsguard";

const execFileAsync = promisify(execFile);
/** Every git call here gets a 10s timeout (a hung git must surface, never hang forever). */
const GIT_TIMEOUT_MS = 10_000;

/**
 * @param repoRoot absolute path to the host repo's git worktree root
 * @invariant code citations resolve against "worktree" (live fs) or a git
 *   rev via `git show`; a citation naming `.forebrief/` itself never
 *   resolves (P3's corollary -- that directory is never a legitimate
 *   citation target)
 */
export function makeForebriefRepoAccess(repoRoot: string): CitationRepoAccess {
  return {
    async readAtRev(rev, relPath) {
      if (isUnderForebrief(repoRoot, relPath)) return null;
      if (rev === "worktree") return readWorktreeFile(repoRoot, relPath);
      return readAtGitRev(repoRoot, rev, relPath);
    },
  };
}

/** kb citations resolve against the live worktree only -- a KB file is read as it stands now, never at a historical rev. */
export function makeForebriefKbAccess(repoRoot: string): CitationKbAccess {
  return {
    readFile: (relPath) =>
      isUnderForebrief(repoRoot, relPath)
        ? Promise.resolve(null)
        : readWorktreeFile(repoRoot, relPath),
  };
}

async function readWorktreeFile(repoRoot: string, relPath: string): Promise<string | null> {
  const absolute = path.resolve(repoRoot, relPath);
  if (
    !absolute.startsWith(path.resolve(repoRoot) + path.sep) &&
    absolute !== path.resolve(repoRoot)
  ) {
    return null; // a citation path must stay inside the repo (mirrors fsguard's containment discipline)
  }
  try {
    const stat = await fs.stat(absolute);
    if (!stat.isFile()) return null;
    return await fs.readFile(absolute, "utf8");
  } catch {
    return null; // missing file is an ordinary, expected outcome (renders "broken"), never a throw
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
