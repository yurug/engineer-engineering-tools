// Module: diff -- GET /api/diff's git plumbing: rename-aware file lists and
// per-file unified hunks between any two refs, or a ref and the worktree.
//
// Implements kb/spec/api-contracts.md's `GET /api/diff` row and
// kb/external/git-cli.md's two diff rows: "Diff file list | git diff
// --name-status -z FROM..TO / FROM (worktree) | rename detection emits
// paired entries (R100 old new) -- parse as pairs" and "Diff hunks | git
// diff -U3 FROM..TO -- PATH | binary files emit 'Binary files differ' ->
// route to E_BINARY handling."
//
// Split out of repo.ts (same reasoning as repo-tree.ts's own header) purely
// for kb/conventions/code-style.md's file-size budget -- this is the fourth
// and last legitimate `child_process` caller in this package, all under the
// SAME trust boundary (architecture/overview.md: "git: always spawned with
// argument vectors; no shell strings (T3)"). Composed onto `RepoAccess`
// (./repo.ts) so callers never need to know the split exists.
//
// Key design decisions (ambiguities kb/spec/api-contracts.md's terse table
// left open -- resolved here, not invented silently; see that file's own
// "Diff (resolved 2026-07-12)" note for the wire-level writeup):
// - Rename detection is forced with `-M` on every call. git's own
//   `diff.renames` default varies by installed version/global gitconfig;
//   pinning it here keeps rename pairing deterministic regardless of the
//   host machine (the same determinism argument git-cli.md makes for
//   pinning `LC_ALL=C`).
// - Per-file hunks accept an OPTIONAL `oldPath` and, when given, pass BOTH
//   paths as pathspecs to `git diff`. Verified empirically (not assumed):
//   filtering a rename's hunks by the NEW path alone makes git treat it as
//   a fresh add, losing the rename match entirely -- git needs to see both
//   sides of the pairing in its pathspec to emit the real content diff.
//   The caller (api/diff.ts) always HAS `oldPath` already, from the file
//   list it fetched first, so this costs no extra git call.
// - A ref that fails `git rev-parse --verify REF^{commit}` is E_BAD_REF.
//   The literal ref "HEAD" failing that check is additionally T1 (unborn
//   HEAD, zero commits) -- reported with the SAME code (error-handling.md:
//   never invent a code for a case an existing one already covers) but a
//   message that names the actual cause, satisfying both E_BAD_REF's
//   "names the ref" contract and T1's "explicit reason" requirement.
// - Binary detection is NOT precomputed for the file list (that would cost
//   an extra whole-diff git call up front, e.g. `--numstat`, contradicting
//   git-cli.md's request budget: "Diff mode: 1 name-status + 1 per opened
//   file"). It is detected lazily, exactly when a file's hunks are
//   requested, by scanning that ONE git call's own output for git's own
//   "Binary files ... differ" line -- no second call.
import { execFile } from "node:child_process";
import { AppError } from "@backbrief/shared";

const GIT_TIMEOUT_MS = 10_000; // git-cli.md: "every git call gets a 10s timeout"
const GIT_ENV = { ...process.env, LC_ALL: "C" }; // git-cli.md: "pin locale -- git localizes some outputs"

export type DiffFileStatus = "added" | "modified" | "deleted" | "renamed" | "copied";

export interface DiffFileEntry {
  /** New (current-side) path; for a deleted file, the only path there is. */
  path: string;
  /** Present only for renamed/copied entries -- the pre-change path. */
  oldPath?: string;
  status: DiffFileStatus;
}

export interface DiffHunkLine {
  kind: "ctx" | "add" | "del";
  text: string;
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffHunkLine[];
}

/**
 * @param ref a git rev, or the literal "worktree" sentinel (always valid,
 *   never checked -- CodeCitation.rev's own convention)
 * @throws {AppError} E_BAD_REF if `ref` does not resolve to a commit --
 *   T1's unborn-HEAD case is reported through this same path (see module header)
 */
export async function assertValidDiffRef(repoRoot: string, ref: string): Promise<void> {
  if (ref === "worktree") return;
  const ok = await execGitOk(repoRoot, ["rev-parse", "--verify", `${ref}^{commit}`]);
  if (ok) return;
  if (ref === "HEAD") {
    throw new AppError(
      "E_BAD_REF",
      "ref 'HEAD' does not resolve -- this repository has no commits yet (T1: diff mode is unavailable until the first commit)",
      { ref },
    );
  }
  throw new AppError("E_BAD_REF", `unknown git ref: ${ref}`, { ref });
}

/**
 * @param to a git rev, or "worktree" to diff `from` against the current
 *   working tree (uncommitted changes included, matching `git diff FROM`'s
 *   own semantics -- staged AND unstaged changes both show up)
 * @returns every changed path between `from` and `to`, rename-paired
 * @invariant NF3 this is the ONE name-status call per diff view -- per-file
 *   hunks are a separate, later call only for files the reader opens
 */
export async function listDiffFiles(
  repoRoot: string,
  from: string,
  to: string,
): Promise<DiffFileEntry[]> {
  const stdout = await execGitBuffer(repoRoot, [
    "diff",
    "-M",
    "--name-status",
    "-z",
    ...rangeArgs(from, to),
    "--",
    ...EXCLUDE_BACKBRIEF_PATHSPEC,
  ]);
  return parseNameStatus(stdout);
}

/**
 * Same exclusion, same reason, as ./repo.ts's `isWorktreeDirty`/
 * `diffNameOnly`: `.backbrief/`'s own committable writes (ADR-003) are
 * backbrief's bookkeeping, never a citable diff target -- without this, a
 * diff view would show its OWN session/event-log files as "changed" the
 * instant `startServer` writes them, exactly the self-triggering storm
 * step 3's T10 test caught for the HEAD watcher (kb/spec/algorithms.md's
 * head-change-handling section). `readDiffFileHunks` needs no matching
 * exclusion: its pathspecs always come from a file list this function
 * already filtered, so a `.backbrief/` path can never reach it.
 */
const EXCLUDE_BACKBRIEF_PATHSPEC = [".", ":!.backbrief"];

/**
 * @param oldPath the file list's own `oldPath`, when `path` is a rename's
 *   new side -- omit for added/modified/deleted entries (module header)
 * @returns the file's hunks in unified-diff order
 * @throws {AppError} E_BINARY if git reports the file as binary -- error-
 *   taxonomy.md: "binary file requested in viewer... offered as download
 *   link instead" (the same code /api/file uses, applied to the same
 *   "tried to view content, couldn't" situation)
 */
export async function readDiffFileHunks(
  repoRoot: string,
  from: string,
  to: string,
  path: string,
  oldPath?: string,
): Promise<DiffHunk[]> {
  const pathspecs = oldPath !== undefined ? [oldPath, path] : [path];
  const stdout = await execGitBuffer(repoRoot, [
    "diff",
    "-M",
    "-U3",
    ...rangeArgs(from, to),
    "--",
    ...pathspecs,
  ]);
  const text = stdout.toString("utf8");
  if (BINARY_MARKER.test(text)) {
    throw new AppError("E_BINARY", `binary file, use the download link: ${path}`, { path });
  }
  return parseHunks(text);
}

/** `to==="worktree"` diffs `from` against the working tree via git's own single-ref form; otherwise a real `from..to` range. */
function rangeArgs(from: string, to: string): string[] {
  return to === "worktree" ? [from] : [`${from}..${to}`];
}

const BINARY_MARKER = /^Binary files .+ differ$/m;

/** Single-letter (+optional similarity score) status code -> our closed DiffFileStatus union. */
function statusFromCode(code: string): DiffFileStatus {
  // `noUncheckedIndexedAccess` makes `code[0]` `string | undefined` even
  // though `code` is never empty (git always emits at least one status
  // letter) -- `?? ""` satisfies the exhaustiveness check without adding a
  // redundant runtime branch this input can never actually hit.
  switch (code[0] ?? "") {
    case "A":
      return "added";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    case "C":
      return "copied";
    case "M":
      return "modified";
    default:
      // T (type change), U (unmerged), X (unknown) -- rare, and none of
      // them changes how this endpoint renders a hunk; "modified" is a
      // safe, honest-enough fallback rather than a hard failure on an
      // odd git output this package doesn't otherwise special-case.
      return "modified";
  }
}

/**
 * @param buffer raw `git diff --name-status -z` output -- NUL-separated
 *   fields, matching git-cli.md's `-z` discipline (T3: filenames may
 *   contain newlines)
 */
function parseNameStatus(buffer: Buffer): DiffFileEntry[] {
  const fields = buffer
    .toString("utf8")
    .split("\0")
    .filter((field) => field.length > 0);
  const entries: DiffFileEntry[] = [];
  let i = 0;
  while (i < fields.length) {
    const code = fields[i]!;
    const status = statusFromCode(code);
    if (status === "renamed" || status === "copied") {
      const oldPath = fields[i + 1];
      const newPath = fields[i + 2];
      if (oldPath === undefined || newPath === undefined) break; // truncated tail -- defensive, never expected from a well-formed -z stream
      entries.push({ path: newPath, oldPath, status });
      i += 3;
    } else {
      const path = fields[i + 1];
      if (path === undefined) break;
      entries.push({ path, status });
      i += 2;
    }
  }
  return entries;
}

/**
 * @param text raw `git diff -U<n>` text output for exactly one file's
 *   pathspec -- preamble lines (`diff --git`, `index`, `---`/`+++`, mode
 *   lines) are skipped; everything from the first `@@ ... @@` header on is
 *   parsed as hunk content
 */
function parseHunks(text: string): DiffHunk[] {
  const HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
  const hunks: DiffHunk[] = [];
  let current: DiffHunk | null = null;
  for (const line of text.split("\n")) {
    const header = HEADER.exec(line);
    if (header) {
      // A hunk header with no comma means "1 line" (git's own shorthand,
      // e.g. "@@ -1 +1 @@") -- verified empirically against real git output.
      current = {
        oldStart: Number(header[1]),
        oldLines: header[2] !== undefined ? Number(header[2]) : 1,
        newStart: Number(header[3]),
        newLines: header[4] !== undefined ? Number(header[4]) : 1,
        lines: [],
      };
      hunks.push(current);
      continue;
    }
    if (!current) continue; // preamble before the first hunk
    if (line.startsWith("\\")) continue; // "\ No newline at end of file" -- a marker, not content
    if (line.startsWith("+")) current.lines.push({ kind: "add", text: line.slice(1) });
    else if (line.startsWith("-")) current.lines.push({ kind: "del", text: line.slice(1) });
    else if (line.startsWith(" ")) current.lines.push({ kind: "ctx", text: line.slice(1) });
    // Any other line inside a hunk body (notably the trailing "" from
    // String.split when the output ends in "\n") is silently skipped --
    // never a real diff-content line under git's own unified format.
  }
  return hunks;
}

/** @returns true if `git <args>` exits 0; never throws (verification, not content retrieval). */
function execGitOk(repoRoot: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    execFile("git", args, { cwd: repoRoot, timeout: GIT_TIMEOUT_MS, env: GIT_ENV }, (error) => {
      resolve(!error);
    });
  });
}

/** Runs git with an argument vector and a fixed timeout, returning raw stdout bytes -- matches repo-tree.ts's own `execGitBuffer` (each split-out file keeps its own copy; the alternative, exporting one shared helper, would re-couple two files split apart FOR independence). */
function execGitBuffer(repoRoot: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      args,
      {
        cwd: repoRoot,
        timeout: GIT_TIMEOUT_MS,
        env: GIT_ENV,
        maxBuffer: 64 * 1024 * 1024,
        encoding: "buffer",
      },
      (error: Error | null, stdout: Buffer) => {
        if (error) reject(error);
        else resolve(stdout);
      },
    );
  });
}
