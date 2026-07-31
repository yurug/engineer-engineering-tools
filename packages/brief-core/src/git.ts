// Module: git -- repo-root resolution, the one git primitive every brief-
// style CLI needs before it can do anything else (`serve --repo DIR`,
// discovery's "walk up looking for a state dir").
//
// Extracted from @backbrief/server's `repo.ts` (kb/external/backbrief-
// internals.md gap found at plan step 1: the daemon mechanism and discovery
// both need this, but the original inventory only listed it under "public
// surface... already clean" without noting it must travel WITH the daemon
// mechanism for a second consumer to reuse either). Zero backbrief-domain
// coupling -- a plain `git rev-parse --show-toplevel` wrapper.
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Every git call here gets a 10s timeout (a hung git must surface, never hang forever). */
const GIT_TIMEOUT_MS = 10_000;

/**
 * @param candidate a directory that may be the repo root or any subdirectory of one
 * @returns the git worktree's top-level absolute path, or null if
 *   `candidate` is not inside a git repository at all
 * @invariant matches plain `git`'s own behavior: `--repo`/`--cwd` may name
 *   any subdirectory, and the state dir always lands at the true top level
 */
export async function resolveRepoRoot(
  candidate: string,
): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["rev-parse", "--show-toplevel"],
      {
        cwd: candidate,
        env: { ...process.env, LC_ALL: "C" }, // git localizes some plumbing output -- pin the locale so parsing stays stable
        timeout: GIT_TIMEOUT_MS,
      },
    );
    return stdout.trim();
  } catch {
    return null;
  }
}
