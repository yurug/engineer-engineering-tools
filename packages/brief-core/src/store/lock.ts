// Module: store/lock -- low-level primitives for `<stateDirName>/server.lock`,
// the single-instance guard.
//
// Extracted from @backbrief/server (ADR-001), `stateDirName` parameterized
// (fsguard's own required-parameter rule, threaded through here). This
// module only knows how to read/write/remove the lock file and check
// whether a pid is alive -- the "second session refuses to start" /
// "stale artifacts get cleaned" *decisions* live one layer up, in
// ./discovery.ts, which also needs server.json to build a useful
// E_ALREADY_RUNNING message.
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { resolveStateDirPath } from "../fsguard";

export interface LockInfo {
  pid: number;
  startedAt: string;
}

const LOCK_RELATIVE_PATH = "server.lock";

/** @returns the current lock's contents, or null if no lock file exists. */
export async function readLock(repoRoot: string, stateDirName: string): Promise<LockInfo | null> {
  try {
    const raw = await fs.readFile(
      resolveStateDirPath(repoRoot, stateDirName, LOCK_RELATIVE_PATH),
      "utf8",
    );
    return JSON.parse(raw) as LockInfo;
  } catch (error) {
    if (isEnoent(error)) return null;
    // A corrupt lock file (partial write, hand-edited) is treated the same
    // as "no lock" -- never hang waiting on a bad artifact, and a lock we
    // can't parse can't prove anyone is running.
    return null;
  }
}

/** Writes a fresh lock file, creating `<stateDirName>/` if needed. */
export async function writeLock(
  repoRoot: string,
  stateDirName: string,
  info: LockInfo,
): Promise<void> {
  const lockPath = resolveStateDirPath(repoRoot, stateDirName, LOCK_RELATIVE_PATH);
  await fs.mkdir(path.dirname(lockPath), { recursive: true });
  await fs.writeFile(lockPath, JSON.stringify(info, null, 2) + "\n", "utf8");
}

export async function removeLock(repoRoot: string, stateDirName: string): Promise<void> {
  await fs.rm(resolveStateDirPath(repoRoot, stateDirName, LOCK_RELATIVE_PATH), { force: true });
}

/**
 * @returns true if `pid` names a live process this machine can see.
 * @invariant the liveness check that distinguishes "process crashed, clean
 *   up" from "process running, refuse to start"
 */
export function isPidAlive(pid: number): boolean {
  try {
    // Signal 0 sends nothing -- it only probes whether the process exists
    // and is signalable, the standard POSIX liveness check.
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: the process exists but is owned by another user -- still alive.
    // ESRCH (or anything else): no such process.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function isEnoent(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
