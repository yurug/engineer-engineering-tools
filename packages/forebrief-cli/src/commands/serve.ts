// Module: commands/serve -- `forebrief serve [--repo DIR] [--title T]
// [--port N] [--open]`.
//
// kb/spec/cli-contract.md: "Start a session; daemonize... One JSON line
// {url, token, port, sessionId, pid} to stdout, then returns." This command
// does NOT run the server itself -- it resolves the repo and hands off to
// @brief/core's generic spawn-detached + poll mechanism (ADR-001).
// @invariant the `token` field is the AGENT token; the human token appears
//   only inside `url` -- never swap them (kb/spec/cli-contract.md's agent
//   notes: "the agent token must never reach a URL shown to the human")
import { spawn } from "node:child_process";
import * as path from "node:path";
import { resolveRepoRoot, daemonizeAndAwaitReady } from "@brief/core";
import { EXIT_ERROR, EXIT_OK, type Io } from "../output";

export interface ServeOptions {
  repo: string;
  title?: string;
  port?: number;
  open: boolean;
}

export interface ServeDeps {
  io: Io;
  /** Absolute path to the compiled daemon entry script this spawns. */
  daemonEntryPath: string;
}

/** forebrief's own choice of core's required stateDirName parameter. */
const STATE_DIR = ".forebrief";

export async function runServeCommand(opts: ServeOptions, deps: ServeDeps): Promise<number> {
  const repoRoot = await resolveRepoRoot(path.resolve(opts.repo));
  if (!repoRoot) {
    deps.io.writeErr(`forebrief: not a git repository: ${opts.repo}`);
    return EXIT_ERROR;
  }

  const args = ["--repo", repoRoot, "--title", opts.title ?? defaultTitle()];
  if (opts.port !== undefined) args.push("--port", String(opts.port));

  const result = await daemonizeAndAwaitReady({
    repoRoot,
    stateDirName: STATE_DIR,
    daemonEntryPath: deps.daemonEntryPath,
    args,
  });
  if (!result.ok) {
    deps.io.writeErr(`forebrief: ${result.message}`);
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
  if (process.env["FOREBRIEF_NO_OPEN"]) return;
  const opener =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    spawn(opener, args, { detached: true, stdio: "ignore" }).unref();
  } catch {
    // best-effort, as documented above
  }
}
