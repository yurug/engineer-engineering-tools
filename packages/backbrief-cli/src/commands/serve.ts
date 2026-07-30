// Module: commands/serve -- `backbrief serve [--repo DIR] [--focus ...]
// [--title T] [--port N] [--open]`.
//
// kb/spec/api-contracts.md#cli: "prints one JSON line: {url, token, port,
// sessionId, pid} then daemonizes." This command does NOT run the server
// itself -- it resolves the repo and hands off to @brief/core's generic
// spawn-detached + poll mechanism (ADR-001: "the daemon spawn/poll/sentinel
// mechanism is IN -- reimplementing it per-CLI would recreate the copy-rot
// this ADR exists to prevent"). Only backbrief's OWN vocabulary stays here:
// the ".backbrief" state-dir choice, the argv shape `bin/daemon-entry.js`
// expects (repo/title/port/focus), and every user-facing string.
import { spawn } from "node:child_process";
import * as path from "node:path";
import { resolveRepoRoot, daemonizeAndAwaitReady } from "@brief/core";
import { EXIT_ERROR, EXIT_OK, type Io } from "../output";

export interface ServeOptions {
  repo: string;
  focus?: string;
  title?: string;
  port?: number;
  open: boolean;
}

export interface ServeDeps {
  io: Io;
  /** Absolute path to the compiled daemon entry script this spawns. */
  daemonEntryPath: string;
}

/** backbrief's own choice of core's required stateDirName parameter. */
const STATE_DIR = ".backbrief";

export async function runServeCommand(opts: ServeOptions, deps: ServeDeps): Promise<number> {
  const repoRoot = await resolveRepoRoot(path.resolve(opts.repo));
  if (!repoRoot) {
    deps.io.writeErr(`backbrief: not a git repository: ${opts.repo}`);
    return EXIT_ERROR;
  }

  // NB: `daemonizeAndAwaitReady` spawns `daemonEntryPath` itself (prepending
  // it to `args`) -- `args` here is ONLY the flags the entry script parses,
  // not the script path again.
  const args = ["--repo", repoRoot, "--title", opts.title ?? defaultTitle()];
  if (opts.port !== undefined) args.push("--port", String(opts.port));
  if (opts.focus !== undefined) args.push("--focus", opts.focus);

  const result = await daemonizeAndAwaitReady({
    repoRoot,
    stateDirName: STATE_DIR,
    daemonEntryPath: deps.daemonEntryPath,
    args,
  });
  if (!result.ok) {
    deps.io.writeErr(`backbrief: ${result.message}`);
    return EXIT_ERROR;
  }

  deps.io.writeOut(
    JSON.stringify({
      url: result.info.url,
      token: result.info.token,
      port: result.info.port,
      sessionId: result.info.sessionId,
      pid: result.info.pid,
    }),
  );
  if (opts.open) openBrowser(result.info.url);
  return EXIT_OK;
}

function defaultTitle(): string {
  return `session ${new Date().toISOString()}`;
}

/** Best-effort only -- a failed open (headless box, unknown platform) must never fail `serve` itself. */
function openBrowser(url: string): void {
  if (process.env["BACKBRIEF_NO_OPEN"]) return;
  const opener =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    spawn(opener, args, { detached: true, stdio: "ignore" }).unref();
  } catch {
    // best-effort, as documented above
  }
}
