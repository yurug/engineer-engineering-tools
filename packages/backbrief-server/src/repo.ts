// Module: repo -- git/worktree content access, the sole legitimate caller
// of `child_process` for git in this package.
//
// architecture/overview.md: "git: always spawned with argument vectors; no
// shell strings (T3)." This module is that boundary -- citation validation
// and minting both resolve content through the `RepoAccess` interface
// defined here rather than shelling out themselves, so there is exactly one
// place that knows how to invoke git.
// Key design decision: `readWorktreeFile`/`readAtRev` return `string | null`
// (null = "does not exist"), never throw for a missing file -- a missing
// citation target is an ordinary, expected outcome (renders "broken", never
// a 500) per algorithms.md#citation-validation: "Missing file/rev -> broken."
// P1's per-pass `(rev,path)` read memoization lives in ./repo-cache.ts, not
// here -- split out purely for the file-size budget (that file's header
// explains the pattern, same one repo-tree.ts/diff.ts already use).
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs/promises";
import { resolveRepoPath } from "./fsguard";
import { listAllTrackedFiles, listWorktreeDir, type DirEntry } from "./repo-tree";
import {
  assertValidDiffRef,
  listDiffFiles,
  readDiffFileHunks,
  type DiffFileEntry,
  type DiffHunk,
} from "./diff";

const execFileAsync = promisify(execFile);

/** Every git call the HEAD watcher makes gets a 10s timeout (a hung git must surface, never hang a poll tick forever). */
const GIT_TIMEOUT_MS = 10_000;

/**
 * Runs `git <args>` with the invocation discipline `kb/external/git-cli.md`
 * demands for the watcher's polling calls: an argument vector (never a
 * shell string, T3), `LC_ALL=C` (git localizes some plumbing output --
 * pinning the locale keeps parsing stable regardless of the host's
 * environment), and a hard timeout so a hung git (fs issues, a huge repo's
 * GC) cannot block a poll tick forever.
 * @returns stdout, or null if git exited non-zero (the caller decides what
 *   that means -- e.g. "unborn HEAD" for rev-parse, never a thrown error
 *   here, matching this module's "missing means null" convention
 */
async function runGit(args: string[], cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      env: { ...process.env, LC_ALL: "C" },
      timeout: GIT_TIMEOUT_MS,
    });
    return stdout;
  } catch {
    return null;
  }
}

/** Injectable repo content access -- lets validation/minting tests use an in-memory fake. */
export interface RepoAccess {
  readonly repoRoot: string;
  /** @returns file content, or null if it does not exist on disk right now. */
  readWorktreeFile(relPath: string): Promise<string | null>;
  /** @returns file content at `rev`, or null if the rev or path does not resolve. */
  readAtRev(rev: string, relPath: string): Promise<string | null>;
  /** @returns the current HEAD commit, or the literal "unborn" (T1: zero-commit repo). */
  headRev(): Promise<string>;
  /** @returns raw bytes (no UTF-8 decoding) -- T3's binary/invalid-UTF-8 sniffing needs the original bytes. */
  readWorktreeFileBuffer(relPath: string): Promise<Buffer | null>;
  readAtRevBuffer(rev: string, relPath: string): Promise<Buffer | null>;
  /** @returns just the size, without reading content -- T4's maxFileBytes guard checked before any read. */
  statWorktreeFile(relPath: string): Promise<{ size: number } | null>;
  /** @returns one directory level (lazy, NF3), or null if `relPath` isn't a directory. */
  listWorktreeDir(relPath: string): Promise<DirEntry[] | null>;
  /** @returns every git-tracked repo-relative path -- annotation relocation's repo-wide search (algorithms.md). */
  listAllTrackedFiles(): Promise<string[]>;
  /** @returns true if the working tree has any uncommitted change (`git status --porcelain=v2` is non-empty) -- the HEAD watcher's other poll signal (algorithms.md#head-change-handling). */
  isWorktreeDirty(): Promise<boolean>;
  /** @returns repo-relative paths that differ between `from` and `to` (or between `from` and the worktree, if `to` is omitted/"worktree") -- the watcher's `changedPaths` and `/api/revalidate`'s target-path resolution both use this. */
  diffNameOnly(from: string, to?: string): Promise<string[]>;
  /** @throws {AppError} E_BAD_REF if `ref` (unless "worktree") does not resolve to a commit -- see ./diff.ts's module header for the T1/unborn-HEAD special case. */
  assertValidRef(ref: string): Promise<void>;
  /** @returns GET /api/diff's file list (step 4, rename-paired) -- see ./diff.ts. */
  diffFiles(from: string, to: string): Promise<DiffFileEntry[]>;
  /** @returns one file's hunks for the same diff. @throws {AppError} E_BINARY for a binary file. */
  diffFileHunks(from: string, to: string, path: string, oldPath?: string): Promise<DiffHunk[]>;
}

/** config.ts's own zod default for `maxFileBytes` -- reused here as
 *  `makeGitRepoAccess`'s fallback so every call site that doesn't thread
 *  the real configured value through still gets SOME guard (PR-B), rather
 *  than none. server.ts passes the real `config.maxFileBytes` explicitly. */
const DEFAULT_MAX_WORKTREE_READ_BYTES = 1_048_576;

/**
 * Git/fs-backed RepoAccess for a real repository on disk.
 * @param repoRoot absolute path to the repo's worktree root
 * @param maxWorktreeReadBytes PR-B (Phase 5 audit): `readWorktreeFile`'s
 *   stat-first guard -- a citation into a file bigger than this is never
 *   attempted as a full UTF-8 read (see that function's own doc for why)
 * @invariant P7/P3 every path this touches is resolved via fsguard first
 * @invariant T3 git is always invoked with an argument vector, never a
 *   shell string -- hostile filenames (spaces, quotes, `;`) cannot escape
 *   into shell interpretation
 */
export function makeGitRepoAccess(
  repoRoot: string,
  maxWorktreeReadBytes = DEFAULT_MAX_WORKTREE_READ_BYTES,
): RepoAccess {
  /**
   * PR-B (Phase 5 audit): T4's contract promises "citations... validate by
   * streaming hash without loading them into the viewer", but this was the
   * one path that still did an unbounded `fs.readFile(utf8)` -- a citation
   * into a multi-hundred-MB worktree file could throw `RangeError`
   * (V8's string-length ceiling) or an OS-level `EFBIG`/`EISDIR`, UNCAUGHT,
   * turning `POST /api/actions` into a 500 and violating citation.ts's own
   * "P1 never throws". Two guards now: (1) stat first and short-circuit to
   * `null` (broken citation) for anything over the configured ceiling,
   * avoiding the risky read in the common case; (2) the catch below is
   * widened as a backstop for whatever (1) doesn't anticipate -- matching
   * this module's header ("a missing citation target is an ordinary,
   * expected outcome") by treating "unsafe to load" the same as "missing".
   */
  async function readWorktreeFile(relPath: string): Promise<string | null> {
    const absolute = resolveRepoPath(repoRoot, relPath);
    try {
      const stat = await fs.stat(absolute);
      if (!stat.isFile() || stat.size > maxWorktreeReadBytes) return null;
      return await fs.readFile(absolute, "utf8");
    } catch (error) {
      if (isEnoent(error) || isDegradableReadError(error)) return null;
      throw error;
    }
  }

  async function readAtRev(rev: string, relPath: string): Promise<string | null> {
    if (rev === "worktree") return readWorktreeFile(relPath);
    // fsguard still applies: `relPath` must resolve inside the repo even
    // though `git show` reads from the object database, not the worktree
    // directly -- this keeps the containment check uniform regardless of
    // which resolution path a citation takes.
    resolveRepoPath(repoRoot, relPath);
    try {
      const { stdout } = await execFileAsync("git", ["show", `${rev}:${relPath}`], {
        cwd: repoRoot,
        maxBuffer: 32 * 1024 * 1024,
        // S3: every other git call in this module (runGit) already carries
        // this pair -- this one and readAtRevBuffer's twin below were
        // missed when the discipline was first written, leaving the hot
        // citation-validation path able to hang forever on a stuck `git
        // show` instead of degrading to E_INTERNAL after 10s.
        env: { ...process.env, LC_ALL: "C" },
        timeout: GIT_TIMEOUT_MS,
      });
      return stdout;
    } catch {
      // Any git failure here (bad rev, path absent at that rev) means the
      // citation cannot be resolved -- algorithms.md treats that uniformly
      // as "broken", so the distinction doesn't need to survive.
      return null;
    }
  }

  async function headRev(): Promise<string> {
    // T1: zero-commit repo -- `git rev-parse HEAD` fails on an unborn branch; runGit's null return covers that uniformly.
    const stdout = await runGit(["rev-parse", "HEAD"], repoRoot);
    return stdout === null ? "unborn" : stdout.trim();
  }

  /**
   * `.backbrief/` is EXCLUDED via git's pathspec exclude magic on every
   * status/diff call this watcher makes -- config-and-formats.md's own
   * ADR-003 makes `.backbrief/`'s contents committable BY DESIGN (only
   * `server.json`/`server.lock` are gitignored), which means every event
   * append/reader-state write is itself an uncommitted worktree change.
   * Without this exclusion, `isWorktreeDirty()`/`diffNameOnly()` would spot
   * backbrief's OWN bookkeeping as "the repo changed" and self-trigger a
   * `head_changed` banner + revalidation storm on nearly every action --
   * found via this step's own T10 integration test (a real `git add -A`
   * commit swept up `.backbrief/*` alongside the intentional source edit).
   * @invariant P8c the watcher only ever reports changes to content a
   *   citation could actually reference (repo source, not our own state)
   */
  const EXCLUDE_BACKBRIEF_PATHSPEC = [".", ":!.backbrief"];

  /** @invariant T3 `-z` (NUL-terminated) so a filename containing a newline still parses as one entry, not two. */
  async function isWorktreeDirty(): Promise<boolean> {
    const stdout = await runGit(
      ["status", "--porcelain=v2", "-z", "--", ...EXCLUDE_BACKBRIEF_PATHSPEC],
      repoRoot,
    );
    return stdout !== null && stdout.length > 0;
  }

  async function diffNameOnly(from: string, to?: string): Promise<string[]> {
    // `to` omitted (or the "worktree" sentinel, matching CodeCitation.rev's
    // own convention) diffs against the working tree -- git-cli.md: "Diff
    // file list | git diff --name-status -z FROM..TO / FROM (worktree)".
    const range = to === undefined || to === "worktree" ? from : `${from}..${to}`;
    const stdout = await runGit(
      ["diff", "--name-only", "-z", range, "--", ...EXCLUDE_BACKBRIEF_PATHSPEC],
      repoRoot,
    );
    if (stdout === null || stdout.length === 0) return [];
    return stdout.split("\0").filter((p) => p.length > 0);
  }

  async function readWorktreeFileBuffer(relPath: string): Promise<Buffer | null> {
    const absolute = resolveRepoPath(repoRoot, relPath);
    try {
      return await fs.readFile(absolute);
    } catch (error) {
      if (isEnoent(error)) return null;
      throw error;
    }
  }

  async function readAtRevBuffer(rev: string, relPath: string): Promise<Buffer | null> {
    if (rev === "worktree") return readWorktreeFileBuffer(relPath);
    resolveRepoPath(repoRoot, relPath);
    try {
      const { stdout } = await execFileAsync("git", ["show", `${rev}:${relPath}`], {
        cwd: repoRoot,
        maxBuffer: 32 * 1024 * 1024,
        encoding: "buffer",
        env: { ...process.env, LC_ALL: "C" }, // S3, see readAtRev's twin call above
        timeout: GIT_TIMEOUT_MS,
      });
      return stdout;
    } catch {
      return null;
    }
  }

  async function statWorktreeFile(relPath: string): Promise<{ size: number } | null> {
    const absolute = resolveRepoPath(repoRoot, relPath);
    try {
      const stat = await fs.stat(absolute);
      return stat.isFile() ? { size: stat.size } : null;
    } catch (error) {
      if (isEnoent(error)) return null;
      throw error;
    }
  }

  return {
    repoRoot,
    readWorktreeFile,
    readAtRev,
    headRev,
    readWorktreeFileBuffer,
    readAtRevBuffer,
    statWorktreeFile,
    // Composed from ./repo-tree.ts (the size-budget split, see that
    // file's header) -- bound to this instance's repoRoot so callers keep
    // using one uniform RepoAccess object regardless of the split.
    listWorktreeDir: (relPath: string) => listWorktreeDir(repoRoot, relPath),
    listAllTrackedFiles: () => listAllTrackedFiles(repoRoot),
    isWorktreeDirty,
    diffNameOnly,
    // Step 4 (kb/plan.md): GET /api/diff -- composed from ./diff.ts the
    // same way listWorktreeDir/listAllTrackedFiles are composed from
    // ./repo-tree.ts (this file's own module header explains the pattern).
    assertValidRef: (ref: string) => assertValidDiffRef(repoRoot, ref),
    diffFiles: (from: string, to: string) => listDiffFiles(repoRoot, from, to),
    diffFileHunks: (from: string, to: string, path: string, oldPath?: string) =>
      readDiffFileHunks(repoRoot, from, to, path, oldPath),
  };
}

// ADR-001 (plan step 1 gap): `resolveRepoRoot` moved to @brief/core --
// the daemon mechanism and CLI discovery both need it, and it has zero
// backbrief-domain coupling (a plain `git rev-parse --show-toplevel`
// wrapper). Re-exported here so this package's own callers (server.ts,
// this package's `index.ts` public surface) keep their original import path.
export { resolveRepoRoot } from "@brief/core";

function isEnoent(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

/** Codes matching an OS-level read failure PR-B degrades to `null` rather than a throw (EFBIG: file too big for the read path; EISDIR: a citation's path turned out to be a directory, not a file). */
const DEGRADABLE_READ_ERROR_CODES = new Set(["EFBIG", "EISDIR", "ERR_FS_FILE_TOO_LARGE"]);

/**
 * True for a read failure that means "this file cannot be safely loaded as
 * a string", never a genuine absence -- PR-B: `readWorktreeFile` degrades
 * these to `null` (broken citation) instead of letting them escape as an
 * uncaught throw, the same treatment this module already gives ENOENT.
 * Node's error SHAPE for "too big to become a string" is inconsistent
 * across versions/paths (a plain `RangeError` for V8's string-length
 * ceiling with no `.code` at all on older Node, `.code`d OS-level failures
 * on others) so this checks both surfaces rather than one exact code.
 */
function isDegradableReadError(error: unknown): boolean {
  if (error instanceof RangeError) return true;
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  return DEGRADABLE_READ_ERROR_CODES.has(String(error.code));
}

/**
 * Splits file content into its logical lines, terminator-aware (handles
 * LF, CRLF, and lone CR uniformly) so no line ever carries a stray `\r` --
 * see kb/spec/algorithms.md#citation-validation and shared/normalize.ts's
 * module header for why that matters. A single trailing terminator (the
 * common "file ends with a newline" case) does not count as an extra empty
 * final line, matching how editors number lines.
 */
export function splitRealLines(content: string): string[] {
  const lines = content.split(/\r\n|\r|\n/);
  const last = lines.at(-1);
  return lines.length > 0 && last === "" ? lines.slice(0, -1) : lines;
}
