// Module: discovery -- forebrief's own instantiation of @brief/core's
// generic discovery primitives (ADR-001), pinned to ".forebrief". Used by
// this package's public surface (index.ts) and by @forebrief/cli's
// `status`/`stop` commands.
import { readServerJson as coreReadServerJson, isPidAlive, type ServerInfo } from "@brief/core";

const STATE_DIR = ".forebrief";

/** @returns the discovery info, or null if no server.json exists ("server down"). */
export function readServerJson(repoRoot: string): Promise<ServerInfo | null> {
  return coreReadServerJson(repoRoot, STATE_DIR);
}

export { isPidAlive, type ServerInfo };
