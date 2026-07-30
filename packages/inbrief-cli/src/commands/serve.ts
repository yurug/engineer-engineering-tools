// Module: commands/serve -- `inbrief serve [--repo DIR] [--port N] [--open]`.
//
// This command does not run the server. It resolves the repo and hands off to
// core's spawn-detached-and-poll mechanism, then prints one JSON line and
// returns, so a caller gets a usable URL without holding a process open.
//
// @invariant the printed `token` is the AGENT token; the human token appears
//   only inside `url`. Swapping them leaks the CLI's own credential into
//   something shown to a person.
import { spawn } from "node:child_process";
import * as path from "node:path";
import { resolveRepoRoot, daemonizeAndAwaitReady } from "@brief/core";
import { EXIT_ERROR, EXIT_OK, type Io } from "../output";

const STATE_DIR = ".inbrief";

export interface ServeOptions {
  repo: string;
  port?: number;
  open: boolean;
  io: Io;
  /** Absolute path to the compiled daemon entry this spawns. */
  daemonEntryPath: string;
}

export async function runServeCommand(opts: ServeOptions): Promise<number> {
  const repoRoot = await resolveRepoRoot(path.resolve(opts.repo));
  if (!repoRoot) {
    opts.io.writeErr(`inbrief: not a git repository: ${opts.repo}`);
    return EXIT_ERROR;
  }

  const args = ["--repo", repoRoot];
  if (opts.port !== undefined) args.push("--port", String(opts.port));

  const result = await daemonizeAndAwaitReady({
    repoRoot,
    stateDirName: STATE_DIR,
    daemonEntryPath: opts.daemonEntryPath,
    args,
  });
  if (!result.ok) {
    opts.io.writeErr(`inbrief: ${result.message}`);
    return EXIT_ERROR;
  }

  opts.io.writeOut(
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

/** Best-effort: a failed open on a headless box must never fail `serve` itself. */
function openBrowser(url: string): void {
  if (process.env["INBRIEF_NO_OPEN"]) return;
  const opener =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    spawn(opener, args, { detached: true, stdio: "ignore" }).unref();
  } catch {
    // best-effort, as documented
  }
}
