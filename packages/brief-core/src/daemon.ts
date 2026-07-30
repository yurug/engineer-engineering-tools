// Module: daemon -- the spawn-detached + poll-for-readiness mechanism every
// brief-style CLI's `serve` command uses to daemonize.
//
// Extracted from @backbrief/cli's `commands/serve.ts` + `bin/daemon-entry.ts`
// (ADR-001: "the daemon spawn/poll/sentinel mechanism is IN -- reimplementing
// it per-CLI would recreate the copy-rot this ADR exists to prevent").
// `serve` does NOT run the server itself -- it resolves the repo, spawns a
// fully-detached child process (a compiled "daemon entry" script the caller
// points at), and waits for that child to either publish
// `<stateDir>/server.json` (success) or a `.serve-error.json` sentinel
// (failure, e.g. E_ALREADY_RUNNING) -- because the child's stdout/stderr are
// redirected to a log file, not piped back to this process, a file-based
// handshake is the only way to observe its outcome without breaking the
// "daemonizes" contract.
// WHY only the MECHANISM moves, not the CLI-facing strings (ADR-001): each
// consumer's daemon-entry script calls its OWN `startServer` with its OWN
// options shape (backbrief's takes `focus`; forebrief's does not), and
// every user-facing message ("not a git repository: ...", the binary name
// in log lines) is consumer vocabulary -- only the spawn/poll/sentinel
// PLUMBING is shared here.
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { readServerJson, type ServerInfo } from "./store/discovery";
import { resolveStateDirPath } from "./fsguard";

const SERVE_ERROR_RELATIVE_PATH = ".serve-error.json";

export interface DaemonizeOptions {
  repoRoot: string;
  /** e.g. ".backbrief", ".forebrief" -- required, no default (fsguard's own rule). */
  stateDirName: string;
  /** Absolute path to the compiled daemon-entry script to spawn -- this is
   *  prepended to `args` automatically; do NOT include it in `args` too. */
  daemonEntryPath: string;
  /** argv FLAGS passed to the daemon entry (NOT including `daemonEntryPath`
   *  itself) -- shape is entirely the caller's own (repo/title/port/focus/...). */
  args: string[];
  /** Generous over a sub-2s startup budget; see the poll loop's own comment for why. Default 5000ms. */
  readyTimeoutMs?: number;
  /** Default 50ms. */
  pollIntervalMs?: number;
}

export type DaemonizeResult = { ok: true; info: ServerInfo } | { ok: false; message: string };

/**
 * Spawns the daemon entry as a detached child, then polls for either
 * success (`server.json` naming this exact child pid) or failure (the
 * `.serve-error.json` sentinel the daemon entry writes on a caught error) --
 * whichever appears first.
 * @invariant surfaces a startup failure (E_ALREADY_RUNNING, a bad repo,
 *   etc.) to the caller promptly instead of a silent multi-second hang
 */
export async function daemonizeAndAwaitReady(opts: DaemonizeOptions): Promise<DaemonizeResult> {
  const stateDir = path.join(opts.repoRoot, opts.stateDirName);
  await fsp.mkdir(stateDir, { recursive: true });
  const errorFilePath = resolveStateDirPath(
    opts.repoRoot,
    opts.stateDirName,
    SERVE_ERROR_RELATIVE_PATH,
  );
  await fsp.rm(errorFilePath, { force: true }); // drop any sentinel left by a previous failed attempt

  const childPid = spawnDetached(opts.daemonEntryPath, opts.args, stateDir);
  return waitForReadyOrError(opts, errorFilePath, childPid);
}

function spawnDetached(daemonEntryPath: string, args: string[], stateDir: string): number {
  const logFd = fs.openSync(path.join(stateDir, "server.log"), "a");
  // `detached: true` + `unref()` is what makes this "daemonize": the child
  // gets its own process group and the calling command can exit without
  // taking the server down with it.
  const child = spawn(process.execPath, [daemonEntryPath, ...args], {
    detached: true,
    stdio: ["ignore", logFd, logFd],
  });
  fs.closeSync(logFd); // the child holds its own duplicate fd; this process no longer needs it
  child.unref();
  if (child.pid === undefined) throw new Error("failed to spawn the daemon process");
  return child.pid;
}

async function waitForReadyOrError(
  opts: DaemonizeOptions,
  errorFilePath: string,
  childPid: number,
): Promise<DaemonizeResult> {
  const pollIntervalMs = opts.pollIntervalMs ?? 50;
  const deadline = Date.now() + (opts.readyTimeoutMs ?? 5_000);
  while (Date.now() < deadline) {
    const info = await readServerJson(opts.repoRoot, opts.stateDirName);
    if (info && info.pid === childPid) return { ok: true, info };
    const errorMessage = await readAndConsumeErrorFile(errorFilePath);
    if (errorMessage !== null) return { ok: false, message: errorMessage };
    await sleep(pollIntervalMs);
  }
  return {
    ok: false,
    message: `timed out waiting for the server to start (see ${opts.stateDirName}/server.log)`,
  };
}

async function readAndConsumeErrorFile(errorFilePath: string): Promise<string | null> {
  try {
    const raw = await fsp.readFile(errorFilePath, "utf8");
    await fsp.rm(errorFilePath, { force: true });
    return (JSON.parse(raw) as { message: string }).message;
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Writes the `.serve-error.json` sentinel a daemon entry script uses to
 * report a startup failure to the `serve` command polling for it (see this
 * module's header for why a file, not a pipe, is the handshake).
 * Best-effort: if this write itself fails, `daemonizeAndAwaitReady`'s poll
 * loop still fails safe via its own timeout.
 */
export async function writeServeErrorSentinel(
  repoRoot: string,
  stateDirName: string,
  code: string,
  message: string,
): Promise<void> {
  const filePath = resolveStateDirPath(repoRoot, stateDirName, SERVE_ERROR_RELATIVE_PATH);
  await fsp.writeFile(filePath, JSON.stringify({ code, message }), "utf8");
}
