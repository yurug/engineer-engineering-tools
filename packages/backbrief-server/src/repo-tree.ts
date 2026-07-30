// Module: repo-tree -- directory listing and repo-wide filename search, the
// second legitimate `child_process`/fs caller alongside ./repo.ts (both
// live in this trust boundary -- architecture/overview.md: "git: always
// spawned with argument vectors; no shell strings (T3)").
//
// Split out of repo.ts purely for kb/conventions/code-style.md's file-size
// budget (<200 lines): `repo.ts` owns per-citation CONTENT resolution
// (validate a specific path/rev), this file owns BROWSING (one directory
// level, GET /api/tree's NF3 laziness) and repo-wide SEARCH (annotation
// relocation's "same basename first" repo scan, algorithms.md). Both are
// composed onto the one `RepoAccess` object `makeGitRepoAccess` returns
// (./repo.ts), so callers never need to know the split exists.
import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { isUnderBackbrief, resolveRepoPath } from "./fsguard";

export interface DirEntry {
  name: string;
  path: string;
  kind: "file" | "dir";
  /** Only present for files -- directories are listed lazily, so their size is never precomputed (NF3). */
  size?: number;
}

const GIT_TIMEOUT_MS = 10_000; // git-cli.md: "every git call gets a 10s timeout"

/**
 * Lists exactly ONE level of `relPath`'s worktree contents -- `.git` and
 * `.backbrief` are always hidden (internal state, never a browsing target)
 * regardless of `config.json`'s own excludes.
 * @returns entries sorted directories-first then alphabetically, or null if
 *   `relPath` does not exist or is not a directory
 * @invariant NF3 never recurses -- exactly one `fs.readdir`, no walk
 */
export async function listWorktreeDir(
  repoRoot: string,
  relPath: string,
): Promise<DirEntry[] | null> {
  // S1 follow-up (Phase 5 audit residual): the dirent filter below hides
  // `.backbrief` as a CHILD, but `GET /api/tree?path=.backbrief` makes it the
  // TARGET, which would list its children (config.json, sessions/, ...). Treat
  // any listing whose target is `.backbrief` or under it as absent, exactly as
  // `api/file.ts` does for reads -- `.backbrief` is internal bookkeeping, never
  // a browsing target from either endpoint.
  if (isUnderBackbrief(repoRoot, relPath)) return null;
  const absolute = resolveRepoPath(repoRoot, relPath);
  let dirents: import("node:fs").Dirent[];
  try {
    dirents = await fs.readdir(absolute, { withFileTypes: true });
  } catch {
    return null; // ENOENT, or a file (not a directory) at this path -- both render E_NOT_FOUND upstream
  }
  const entries = await Promise.all(
    dirents
      .filter((d) => d.name !== ".git" && d.name !== ".backbrief")
      .map((d) => toDirEntry(absolute, relPath, d)),
  );
  return entries.sort(compareDirEntries);
}

async function toDirEntry(
  absoluteDir: string,
  relDir: string,
  dirent: import("node:fs").Dirent,
): Promise<DirEntry> {
  const childRelPath = relDir === "" ? dirent.name : `${relDir}/${dirent.name}`;
  if (dirent.isDirectory()) return { name: dirent.name, path: childRelPath, kind: "dir" };
  const stat = await fs.stat(path.join(absoluteDir, dirent.name)).catch(() => null);
  return {
    name: dirent.name,
    path: childRelPath,
    kind: "file",
    ...(stat ? { size: stat.size } : {}),
  };
}

function compareDirEntries(a: DirEntry, b: DirEntry): number {
  if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
  return a.name.localeCompare(b.name);
}

/**
 * Every git-TRACKED path in the repo, repo-relative -- used only by
 * annotation relocation's repo-wide "same basename first" search
 * (algorithms.md#annotation-anchoring-and-relocation), a rare, on-demand
 * operation triggered by one stale annotation at a time, never a hot path.
 * @invariant T3 `git ls-files -z`, split on NUL (filenames may contain
 *   newlines) -- git-cli.md's invocation discipline
 */
export async function listAllTrackedFiles(repoRoot: string): Promise<string[]> {
  try {
    const stdout = await execGitBuffer(repoRoot, ["ls-files", "-z"]);
    return stdout
      .toString("utf8")
      .split("\0")
      .filter((entry) => entry.length > 0);
  } catch {
    // Not a repo / git failure -- relocation degrades to "same-file only"
    // (its caller already tried the whole file); an empty list is a safe,
    // non-throwing fallback, matching repo.ts's "missing => null/[], never a 500" pattern.
    return [];
  }
}

/** Runs git with an argument vector and a fixed timeout, returning raw stdout bytes. */
function execGitBuffer(repoRoot: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      args,
      {
        cwd: repoRoot,
        timeout: GIT_TIMEOUT_MS,
        maxBuffer: 64 * 1024 * 1024,
        encoding: "buffer",
        // S4: every other git call in this trust boundary pins the locale
        // (git-cli.md's invocation discipline) -- this one was missed.
        env: { ...process.env, LC_ALL: "C" },
      },
      (error: Error | null, stdout: Buffer) => {
        if (error) reject(error);
        else resolve(stdout);
      },
    );
  });
}
