// Module: store/lock -- backbrief's own instantiation of @brief/core's
// generic lock primitives (ADR-001), pinned to ".backbrief". Preserves the
// original (no stateDirName parameter) call signature for every existing
// caller in this package.
import {
  readLock as coreReadLock,
  writeLock as coreWriteLock,
  removeLock as coreRemoveLock,
  isPidAlive,
  type LockInfo,
} from "@brief/core";

const STATE_DIR = ".backbrief";

export function readLock(repoRoot: string): Promise<LockInfo | null> {
  return coreReadLock(repoRoot, STATE_DIR);
}

export function writeLock(repoRoot: string, info: LockInfo): Promise<void> {
  return coreWriteLock(repoRoot, STATE_DIR, info);
}

export function removeLock(repoRoot: string): Promise<void> {
  return coreRemoveLock(repoRoot, STATE_DIR);
}

export { isPidAlive, type LockInfo };
