// Module: discovery -- finding the running server for this repository.
//
// Every command except `serve` needs the same three things: the repo root, the
// server's port, and the agent token. None of them should be flags a human has
// to remember, so all three come off disk from `.inbrief/server.json`.
//
// @invariant the token read here is the AGENT token. It is the CLI's own
//   credential and must never be printed into anything a human is shown; the
//   human's token lives only inside `server.json`'s `url` field.
import * as path from "node:path";
import { readServerJson, resolveRepoRoot, type ServerInfo } from "@brief/core";

const STATE_DIR = ".inbrief";

export interface Connection {
  repoRoot: string;
  info: ServerInfo;
}

/**
 * @param startDir where to begin looking for the git root, usually the cwd
 * @returns the repo root and the live server's discovery record, or a reason
 * @invariant returns a reason rather than throwing, because "no server running"
 *   is an ordinary outcome a command must report as a one-line message and exit
 *   1, not an exception with a stack trace.
 */
export async function connect(
  startDir: string,
): Promise<{ ok: true; connection: Connection } | { ok: false; reason: string }> {
  const repoRoot = await resolveRepoRoot(path.resolve(startDir));
  if (!repoRoot) return { ok: false, reason: `not a git repository: ${startDir}` };
  const info = await readServerJson(repoRoot, STATE_DIR);
  if (!info) return { ok: false, reason: "no server running for this repo -- run `inbrief serve`" };
  return { ok: true, connection: { repoRoot, info } };
}

/** @returns the base URL for API calls, which is NOT `info.url` (that one carries the human token). */
export function apiBase(info: ServerInfo): string {
  return `http://127.0.0.1:${String(info.port)}`;
}
