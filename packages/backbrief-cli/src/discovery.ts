// Module: discovery -- finds the live server for the current repo.
//
// Implements kb/external/claude-code-agent-runtime.md's "User runs the
// agent with a different CWD -> CLI takes --repo and falls back to walking
// up for .backbrief/" and kb/spec/config-and-formats.md's discovery
// handshake. Every command except `serve` starts here: no command parses
// `serve`'s stdout or holds session state across invocations (statelessness
// across turns -- the CLI is stateless by contract, ext-claude-code.md).
import * as path from "node:path";
import { readServerJson, isPidAlive, type ServerInfo } from "@backbrief/server";

export interface Discovered {
  repoRoot: string;
  info: ServerInfo;
}

/**
 * @param startDir where to start looking -- `--repo` if given, else `process.cwd()`
 * @returns the repo root and live ServerInfo, or null if no server.json is
 *   found walking up to the filesystem root, OR one is found but its pid is
 *   dead (T8: "every command treats the server as down... no hanging retries")
 */
export async function findLiveServer(startDir: string): Promise<Discovered | null> {
  let dir = path.resolve(startDir);
  for (;;) {
    const info = await readServerJson(dir);
    if (info) return isPidAlive(info.pid) ? { repoRoot: dir, info } : null;
    const parent = path.dirname(dir);
    if (parent === dir) return null; // reached the filesystem root
    dir = parent;
  }
}
