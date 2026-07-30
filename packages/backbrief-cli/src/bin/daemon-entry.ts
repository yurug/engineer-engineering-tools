#!/usr/bin/env node
// Module: bin/daemon-entry -- the actual long-running server process.
//
// Spawned detached by ../commands/serve.ts; never invoked directly by a
// user. Its only job is to call @backbrief/server's `startServer` and then
// get out of the way -- the HTTP server it starts keeps the event loop
// alive, so "success" here just means this function returns and the
// process keeps running. On failure it writes a small sentinel file the
// parent `serve` command polls for (see serve.ts's module header for why a
// file, not a pipe, is the handshake).
import { startServer } from "@backbrief/server";
import { AppError, type Focus } from "@backbrief/shared";
import { writeServeErrorSentinel } from "@brief/core";
import { parseFocus } from "../focus";

/** backbrief's own choice of core's required stateDirName parameter. */
const STATE_DIR = ".backbrief";

interface DaemonArgs {
  repo: string;
  title: string;
  port?: number;
  focus?: Focus;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  try {
    await startServer({
      repoRoot: args.repo,
      title: args.title,
      // exactOptionalPropertyTypes: only include these keys when present --
      // see backbrief.ts's matching comment for the same pattern.
      ...(args.port !== undefined ? { port: args.port } : {}),
      ...(args.focus !== undefined ? { focus: args.focus } : {}),
    });
  } catch (error) {
    await reportFailure(args.repo, error);
    process.exitCode = 1;
  }
}

async function reportFailure(repo: string, error: unknown): Promise<void> {
  // WHY the explicit `AppError<string>` cast: `instanceof` against a
  // generic class (AppError's `Code` type parameter, ADR-001) narrows
  // `.code` to `any`, not backbrief's `ErrorCode` union.
  const code: string = error instanceof AppError ? (error as AppError<string>).code : "E_INTERNAL";
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[backbrief daemon] ${code}: ${message}`);
  // Best-effort: if we can't even write the sentinel, `serve`'s poll loop
  // still fails safe via its own timeout.
  await writeServeErrorSentinel(repo, STATE_DIR, code, message).catch(() => undefined);
}

function parseArgs(argv: string[]): DaemonArgs {
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2)
    flags.set(argv[i]!.replace(/^--/, ""), argv[i + 1] ?? "");
  const repo = flags.get("repo");
  const title = flags.get("title");
  if (!repo || !title) throw new Error("daemon-entry requires --repo and --title");
  return {
    repo,
    title,
    ...(flags.has("port") ? { port: Number(flags.get("port")) } : {}),
    ...(flags.has("focus") ? { focus: parseFocus(flags.get("focus")!) } : {}),
  };
}

void main();
