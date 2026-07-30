// Module: store/discovery -- `<stateDirName>/server.json`, the live-server
// discovery handshake, plus the startup recovery decision (refuse if a live
// server holds the repo; clean up and proceed if the artifacts are stale).
//
// Extracted from @backbrief/server (ADR-001), `stateDirName` parameterized.
// `server.json` is the discovery handshake: every non-`serve` command reads
// it to find port+token, so a CLI never parses `serve`'s stdout beyond its
// first JSON line.
import * as fs from "node:fs/promises";
import * as net from "node:net";
import * as path from "node:path";
import { AppError } from "@brief/shared";
import { resolveStateDirPath } from "../fsguard";
import { isPidAlive, readLock, removeLock, writeLock, type LockInfo } from "./lock";

/** How long to wait for the recorded server to accept a TCP connection before
 *  concluding it is wedged/gone. Loopback connects succeed in well under a
 *  millisecond when a server is really listening, so this is generous. */
const REACHABILITY_TIMEOUT_MS = 500;

/**
 * @returns true if something is accepting TCP connections on `127.0.0.1:port`.
 * @invariant pid-liveness alone is not proof a server is up -- a daemon can
 *   linger alive with its listener already closed, and a dead server's pid
 *   can be REUSED by an unrelated process. Probing the port distinguishes
 *   "genuinely serving" from both, where `process.kill(pid, 0)` cannot.
 */
export function isServerResponding(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    // A single resolver guarded against the connect/error/timeout race.
    const done = (reachable: boolean): void => {
      socket.destroy();
      resolve(reachable);
    };
    socket.setTimeout(REACHABILITY_TIMEOUT_MS);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false)); // ECONNREFUSED (nothing listening) lands here
  });
}

export interface ServerInfo {
  pid: number;
  port: number;
  url: string;
  /** Agent-token bearer credential -- the human token lives only in the browser URL, never here. */
  token: string;
  sessionId: string;
  startedAt: string;
}

const SERVER_JSON_RELATIVE_PATH = "server.json";

export async function writeServerJson(
  repoRoot: string,
  stateDirName: string,
  info: ServerInfo,
): Promise<void> {
  const filePath = resolveStateDirPath(repoRoot, stateDirName, SERVER_JSON_RELATIVE_PATH);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(info, null, 2) + "\n", "utf8");
}

/** @returns the discovery info, or null if no server.json exists ("server down" case for the CLI). */
export async function readServerJson(
  repoRoot: string,
  stateDirName: string,
): Promise<ServerInfo | null> {
  try {
    const raw = await fs.readFile(
      resolveStateDirPath(repoRoot, stateDirName, SERVER_JSON_RELATIVE_PATH),
      "utf8",
    );
    return JSON.parse(raw) as ServerInfo;
  } catch {
    return null;
  }
}

export async function removeServerJson(repoRoot: string, stateDirName: string): Promise<void> {
  await fs.rm(resolveStateDirPath(repoRoot, stateDirName, SERVER_JSON_RELATIVE_PATH), {
    force: true,
  });
}

/**
 * Runs at `serve` startup, before any new lock is written: "refuse if a live
 * server holds the lock" and "clean stale artifacts and start fresh" are the
 * same check with two outcomes.
 * @throws {AppError} E_ALREADY_RUNNING (with the live server's url/pid in
 *   `details`) only if the lock names a live pid AND that server is actually
 *   accepting connections on its recorded port
 * @invariant the caller can hand the existing url over instead of failing
 *   the workflow -- that is why the url is in `details`, not just logged
 * @invariant stale artifacts are removed before `serve` proceeds when the
 *   pid is dead, when there is no server.json to prove reachability, OR when
 *   the pid is alive but its port no longer responds (wedged daemon / reused
 *   pid) -- so a broken previous run never permanently blocks startup
 */
export async function recoverStaleArtifactsOrThrow(
  repoRoot: string,
  stateDirName: string,
): Promise<void> {
  const lock = await readLock(repoRoot, stateDirName);
  if (!lock) return; // nothing to recover from -- first start, or already clean
  const info = await readServerJson(repoRoot, stateDirName);
  // Refuse ONLY when we can positively confirm a live, serving instance:
  // the pid is alive AND we know its port AND that port accepts a connection.
  // Any weaker evidence (dead pid, missing server.json, or an unresponsive
  // port) means the artifacts are stale -- clean them and let `serve` proceed
  // rather than blocking the user behind a corpse.
  if (lock.pid && isPidAlive(lock.pid) && info && (await isServerResponding(info.port))) {
    throw new AppError(
      "E_ALREADY_RUNNING",
      `a server is already running for this repo (pid ${lock.pid}, ${info.url})`,
      { pid: lock.pid, url: info.url },
    );
  }
  await Promise.all([removeLock(repoRoot, stateDirName), removeServerJson(repoRoot, stateDirName)]);
}

export { writeLock, removeLock, isPidAlive, type LockInfo };
