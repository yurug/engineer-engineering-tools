// Module: search -- ripgrep-backed full-text search, spawned with argument
// vectors (never a shell string, T3/P7) -- see kb/external/ripgrep.md for
// the runtime behavior (flags, `--json` line shapes, timeout discipline)
// this module implements.
//
// kb/plan.md step 2: "ripgrep-backed symbol search". A deliberate scope
// exception to NF3 ("no endpoint may be O(repo) except /api/coverage") --
// full-text search is, by definition, over repo content; see the same-
// commit clarification added to properties/non-functional.md#NF3. Bounded
// by MAX_RESULTS (kills the child process early once enough hits are
// found) and a hard RG_TIMEOUT_MS, so even an unbounded query on a huge
// repo returns promptly.
import { spawn } from "node:child_process";
import { AppError } from "@backbrief/shared";

export interface SearchMatch {
  path: string;
  line: number;
  column: number;
  text: string;
}

export interface SearchResult {
  matches: SearchMatch[];
  truncated: boolean;
}

const MAX_RESULTS = 200;
const PER_FILE_MAX_COUNT = 20; // caps one noisy file from crowding out every other result
const RG_TIMEOUT_MS = 10_000; // git-cli.md's own discipline, applied to the other external CLI we shell out to

/**
 * @param repoRoot searched as `rg`'s cwd with no PATH argument -- ripgrep
 *   then searches "." itself, so every result path comes back repo-relative
 * @param query literal/regex text to search for (rg's own syntax) -- an
 *   empty query is treated as "no results" rather than spawned (a bare
 *   empty pattern would match every line of every file)
 * @param excludeGlobs config.json's `excludes` -- passed as negated
 *   `--glob '!pattern'` flags so search respects the same visibility rules
 *   as the file tree (ripgrep already skips `.git` and dotdirs like
 *   `.backbrief` by default, so those need no explicit glob)
 * @throws {AppError} E_INTERNAL if the `rg` binary is missing or exits
 *   with a real error (exit code 2 -- exit 1, "no matches", is success)
 */
export async function searchRepo(
  repoRoot: string,
  query: string,
  excludeGlobs: readonly string[],
): Promise<SearchResult> {
  if (query.trim() === "") return { matches: [], truncated: false };
  const args = [
    "--json",
    "--max-count",
    String(PER_FILE_MAX_COUNT),
    "--max-filesize",
    "1M",
    ...excludeGlobs.flatMap((glob) => ["--glob", `!${glob}`]),
    "--",
    query,
    // Explicit path argument, deliberately: with NO path, ripgrep reads
    // `atty::is(Stdin)` to decide whether to search the cwd or search
    // STDIN -- and a spawned child's stdin is a pipe (not a tty) by
    // default, so an omitted path here makes rg block forever waiting for
    // stdin EOF that never comes (found by a real hung-test timeout, not
    // by reading rg's docs closely enough the first time). "." makes the
    // target explicit and removes the ambiguity entirely.
    ".",
  ];
  return runRipgrep(repoRoot, args);
}

function runRipgrep(repoRoot: string, args: string[]): Promise<SearchResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("rg", args, { cwd: repoRoot });
    const matches: SearchMatch[] = [];
    let truncated = false;
    let buffered = "";
    let settled = false;
    const timer = setTimeout(() => child.kill(), RG_TIMEOUT_MS);

    const finish = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ matches, truncated });
    };

    child.stdout.on("data", (chunk: Buffer) => {
      buffered += chunk.toString("utf8");
      const lines = buffered.split("\n");
      buffered = lines.pop() ?? ""; // last element may be a not-yet-terminated line
      for (const line of lines) {
        const parsed = parseRgMatchLine(line);
        if (!parsed) continue;
        matches.push(parsed);
        if (matches.length >= MAX_RESULTS) {
          truncated = true;
          child.kill(); // stop scanning the rest of a large repo once we have enough
          finish();
          return;
        }
      }
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      if (settled) return;
      clearTimeout(timer);
      settled = true;
      reject(
        error.code === "ENOENT"
          ? new AppError("E_INTERNAL", "ripgrep (rg) is required but was not found on PATH", {})
          : new AppError("E_INTERNAL", `ripgrep failed: ${error.message}`, {}),
      );
    });
    child.on("close", (code) => {
      if (settled) return;
      // rg's own exit codes: 0 = matches found, 1 = no matches (success), 2 = real error.
      if (code === 2) reject(new AppError("E_INTERNAL", "ripgrep reported an error", { code }));
      else finish();
    });
  });
}

interface RgJsonLine {
  type: string;
  data?: {
    path?: { text?: string };
    line_number?: number;
    lines?: { text?: string };
    submatches?: { start: number }[];
  };
}

/** Parses one `rg --json` line, keeping only `type: "match"` entries (begin/end/summary lines are ignored). */
function parseRgMatchLine(line: string): SearchMatch | null {
  if (line.trim() === "") return null;
  let parsed: RgJsonLine;
  try {
    parsed = JSON.parse(line) as RgJsonLine;
  } catch {
    return null;
  }
  if (parsed.type !== "match" || !parsed.data) return null;
  const { path, line_number: lineNumber, lines, submatches } = parsed.data;
  if (!path?.text || lineNumber === undefined || !lines?.text) return null;
  return {
    // The explicit "." path argument (see searchRepo) makes rg echo paths
    // back as "./relative/path" -- strip the prefix so results match the
    // same repo-relative convention as GET /api/tree and GET /api/file.
    path: path.text.replace(/^\.\//, ""),
    line: lineNumber,
    column: (submatches?.[0]?.start ?? 0) + 1, // rg's start is 0-based byte offset; +1 for a 1-based column
    text: lines.text.replace(/\r?\n$/, ""),
  };
}
