#!/usr/bin/env node
// Module: bin/daemon-entry -- the long-running server process.
//
// Spawned detached by ../commands/serve.ts via core's daemonize mechanism, never
// run by hand. Its only job is to start the server and get out of the way. On
// failure it writes the sentinel file the parent `serve` polls for, so a startup
// crash surfaces as a message instead of a timeout.
import { startServer } from "@inbrief/server";
import { AppError } from "@brief/shared";
import { writeServeErrorSentinel } from "@brief/core";

const STATE_DIR = ".inbrief";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  try {
    await startServer({
      repoRoot: args.repo,
      ...(args.port !== undefined ? { port: args.port } : {}),
    });
  } catch (error) {
    await reportFailure(args.repo, error);
    process.exitCode = 1;
  }
}

async function reportFailure(repo: string, error: unknown): Promise<void> {
  const code: string = error instanceof AppError ? (error as AppError<string>).code : "E_INTERNAL";
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[inbrief daemon] ${code}: ${message}`);
  // Best-effort: if even the sentinel cannot be written, `serve`'s poll loop
  // still fails safe on its own timeout.
  await writeServeErrorSentinel(repo, STATE_DIR, code, message).catch(() => undefined);
}

function parseArgs(argv: string[]): { repo: string; port?: number } {
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2)
    flags.set(argv[i]!.replace(/^--/, ""), argv[i + 1] ?? "");
  const repo = flags.get("repo");
  if (!repo) throw new Error("daemon-entry requires --repo");
  return { repo, ...(flags.has("port") ? { port: Number(flags.get("port")) } : {}) };
}

void main();
