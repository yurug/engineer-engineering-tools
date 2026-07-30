#!/usr/bin/env node
// Module: bin/forebrief -- the `forebrief` executable's argv dispatcher.
//
// kb/spec/cli-contract.md: the eight documented commands (serve, status,
// stop, post, act, events, digest, fold -- fold added plan step 4).
import * as path from "node:path";
import { extractFlag, hasFlag } from "../args";
import { processIo } from "../output";
import { runServeCommand } from "../commands/serve";
import { runStatusCommand } from "../commands/status";
import { runStopCommand } from "../commands/stop";
import { runPostCommand } from "../commands/post";
import { runActCommand } from "../commands/act";
import { runEventsCommand } from "../commands/events";
import { runDigestCommand } from "../commands/digest";
import { runFoldCommand } from "../commands/fold";

// Compiled sibling of this file (see cli/package.json's build output layout).
const DAEMON_ENTRY_PATH = path.join(__dirname, "daemon-entry.js");

async function main(): Promise<number> {
  const [command, ...rest] = process.argv.slice(2);
  // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check
  switch (command) {
    case "serve": {
      const title = extractFlag(rest, "--title");
      const port = numberFlag(rest, "--port");
      return runServeCommand(
        {
          repo: extractFlag(rest, "--repo") ?? process.cwd(),
          open: hasFlag(rest, "--open"),
          ...(title !== undefined ? { title } : {}),
          ...(port !== undefined ? { port } : {}),
        },
        { io: processIo, daemonEntryPath: DAEMON_ENTRY_PATH },
      );
    }
    case "status":
      return runStatusCommand({ repoStartDir: process.cwd(), io: processIo });
    case "stop":
      return runStopCommand({ repoStartDir: process.cwd(), io: processIo });
    case "post": {
      const input = requirePositional(rest, "post");
      if (!input) return 1;
      return runPostCommand({ repoStartDir: process.cwd(), input, io: processIo });
    }
    case "act": {
      const input = requirePositional(rest, "act");
      if (!input) return 1;
      return runActCommand({ repoStartDir: process.cwd(), input, io: processIo });
    }
    case "events": {
      const since = numberFlag(rest, "--since");
      const timeoutSecs = numberFlag(rest, "--timeout");
      return runEventsCommand({
        repoStartDir: process.cwd(),
        follow: hasFlag(rest, "--follow"),
        io: processIo,
        ...(since !== undefined ? { since } : {}),
        ...(timeoutSecs !== undefined ? { timeoutSecs } : {}),
      });
    }
    case "digest":
      return runDigestCommand({ repoStartDir: process.cwd(), io: processIo });
    case "fold": {
      const round = extractFlag(rest, "--round");
      const card = extractFlag(rest, "--card");
      const out = extractFlag(rest, "--out");
      return runFoldCommand({
        repoStartDir: process.cwd(),
        io: processIo,
        ...(round !== undefined ? { round } : {}),
        ...(card !== undefined ? { card } : {}),
        ...(out !== undefined ? { out } : {}),
      });
    }
    default:
      processIo.writeErr(
        `forebrief: unknown command '${command ?? ""}'. Try: serve, status, stop, post, act, events, digest, fold.`,
      );
      return 1;
  }
}

function numberFlag(argv: readonly string[], name: string): number | undefined {
  const raw = extractFlag(argv, name);
  return raw === undefined ? undefined : Number(raw);
}

/** @returns the `FILE.json | -` positional argument, or undefined (with an stderr message already written) if it's missing. */
function requirePositional(argv: readonly string[], command: string): string | undefined {
  const value = argv.find((arg) => !arg.startsWith("--"));
  if (value === undefined)
    processIo.writeErr(`forebrief: '${command}' requires a FILE.json or - (stdin) argument`);
  return value;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    processIo.writeErr(`forebrief: unexpected error: ${String(error)}`);
    process.exitCode = 1;
  });
