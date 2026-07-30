// Module: store/discovery -- backbrief's own instantiation of
// @brief/core's generic discovery/recovery primitives (ADR-001), pinned
// to ".backbrief". Preserves the original (no stateDirName parameter) call
// signature for every existing caller in this package.
import {
  isServerResponding,
  writeServerJson as coreWriteServerJson,
  readServerJson as coreReadServerJson,
  removeServerJson as coreRemoveServerJson,
  recoverStaleArtifactsOrThrow as coreRecoverStaleArtifactsOrThrow,
  type ServerInfo,
  type LockInfo,
} from "@brief/core";
// The 2-arg (no stateDirName) wrappers -- this package's OWN pinned
// instantiation, defined once in ./lock.ts and re-exported here so every
// existing `import { writeLock } from "./store/discovery"` call site keeps
// its original signature.
import { writeLock, removeLock } from "./lock";

const STATE_DIR = ".backbrief";

export { isServerResponding };

export function writeServerJson(repoRoot: string, info: ServerInfo): Promise<void> {
  return coreWriteServerJson(repoRoot, STATE_DIR, info);
}

export function readServerJson(repoRoot: string): Promise<ServerInfo | null> {
  return coreReadServerJson(repoRoot, STATE_DIR);
}

export function removeServerJson(repoRoot: string): Promise<void> {
  return coreRemoveServerJson(repoRoot, STATE_DIR);
}

export function recoverStaleArtifactsOrThrow(repoRoot: string): Promise<void> {
  return coreRecoverStaleArtifactsOrThrow(repoRoot, STATE_DIR);
}

export { writeLock, removeLock, type LockInfo, type ServerInfo };
