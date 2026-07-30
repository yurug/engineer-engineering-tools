// Module: discovery -- finds the live server for the current repo.
//
// Every command except `serve` starts here: no command parses `serve`'s
// stdout or holds session state across invocations (the CLI is stateless
// by contract). Mirrors @backbrief/cli's own discovery.ts.
import * as path from "node:path";
import { readServerJson, isPidAlive, type ServerInfo } from "@forebrief/server";

export interface Discovered {
  repoRoot: string;
  info: ServerInfo;
}

/**
 * @param startDir where to start looking -- `process.cwd()` for every
 *   command that doesn't take `--repo` at plan step 1
 * @returns the repo root and live ServerInfo, or null if no server.json is
 *   found walking up to the filesystem root, OR one is found but its pid is
 *   dead (T6: "every command treats the server as down")
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
