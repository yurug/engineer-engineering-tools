#!/usr/bin/env node
// Module: bin/daemon-entry -- the actual long-running server process.
//
// Spawned detached by ../commands/serve.ts (via @brief/core's
// `daemonizeAndAwaitReady`); never invoked directly by a user. Its only job
// is to call @forebrief/server's `startServer` and then get out of the way.
// On failure it writes the `.serve-error.json` sentinel the parent `serve`
// command polls for.
import { startServer } from "@forebrief/server";
import { AppError } from "@brief/shared";
import { writeServeErrorSentinel } from "@brief/core";

/** forebrief's own choice of core's required stateDirName parameter. */
const STATE_DIR = ".forebrief";

interface DaemonArgs {
  repo: string;
  title: string;
  port?: number;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  try {
    await startServer({
      repoRoot: args.repo,
      title: args.title,
      ...(args.port !== undefined ? { port: args.port } : {}),
    });
  } catch (error) {
    await reportFailure(args.repo, error);
    process.exitCode = 1;
  }
}

async function reportFailure(repo: string, error: unknown): Promise<void> {
  // WHY the explicit `AppError<string>` cast: `instanceof` against a
  // generic class (AppError's `Code` type parameter, ADR-001) narrows
  // `.code` to `any`, not any ONE consumer's closed union.
  const code: string = error instanceof AppError ? (error as AppError<string>).code : "E_INTERNAL";
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[forebrief daemon] ${code}: ${message}`);
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
  };
}

void main();
