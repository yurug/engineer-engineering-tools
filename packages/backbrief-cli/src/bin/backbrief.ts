#!/usr/bin/env node
// Module: bin/backbrief -- the `backbrief` executable's argv dispatcher.
//
// kb/spec/api-contracts.md#cli: the six commands (serve, act, events,
// status, digest, stop) are this file's entire vocabulary. Per ADR-001,
// there is no seventh command and no flag that isn't in that contract --
// growth belongs in the server/protocol, not here.
import * as path from "node:path";
import type { Actor } from "@backbrief/shared";
import { extractFlag, hasFlag } from "../args";
import { processIo } from "../output";
import { runActCommand } from "../commands/act";
import { runDigestCommand } from "../commands/digest";
import { runEventsCommand } from "../commands/events";
import { runServeCommand } from "../commands/serve";
import { runStatusCommand } from "../commands/status";
import { runStopCommand } from "../commands/stop";

// Compiled sibling of this file (see cli/package.json's build output layout).
const DAEMON_ENTRY_PATH = path.join(__dirname, "daemon-entry.js");

async function main(): Promise<number> {
  const [command, ...rest] = process.argv.slice(2);
  // `command` is an open string (any argv[2], including undefined for a
  // bare `backbrief`), not the closed ActionType/EventType unions
  // switch-exhaustiveness-check exists to guard -- the `default` arm below
  // is the real exhaustiveness boundary here.
  // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check
  switch (command) {
    case "serve": {
      // exactOptionalPropertyTypes forbids `focus: undefined` for an
      // optional `focus?: string` field -- these keys must be OMITTED, not
      // present-with-undefined, so they're spread in conditionally rather
      // than always-included with a possibly-undefined value.
      const focus = extractFlag(rest, "--focus");
      const title = extractFlag(rest, "--title");
      const port = numberFlag(rest, "--port");
      return runServeCommand(
        {
          repo: extractFlag(rest, "--repo") ?? process.cwd(),
          open: hasFlag(rest, "--open"),
          ...(focus !== undefined ? { focus } : {}),
          ...(title !== undefined ? { title } : {}),
          ...(port !== undefined ? { port } : {}),
        },
        { io: processIo, daemonEntryPath: DAEMON_ENTRY_PATH },
      );
    }
    case "act":
      return runActCommand(rest[0] ?? "-", { repoStartDir: process.cwd(), io: processIo });
    case "events": {
      const timeoutSecs = numberFlag(rest, "--timeout");
      return runEventsCommand(
        {
          since: Number(extractFlag(rest, "--since") ?? "0"),
          follow: hasFlag(rest, "--follow"),
          ...(extractFlag(rest, "--actor") !== undefined
            ? { actor: actorFlag(rest, "--actor") }
            : {}),
          ...(timeoutSecs !== undefined ? { timeoutSecs } : {}),
        },
        { repoStartDir: process.cwd(), io: processIo },
      );
    }
    case "status":
      return runStatusCommand({ repoStartDir: process.cwd(), io: processIo });
    case "digest":
      return runDigestCommand({ repoStartDir: process.cwd(), io: processIo });
    case "stop":
      return runStopCommand({ repoStartDir: process.cwd(), io: processIo });
    default:
      processIo.writeErr(
        `backbrief: unknown command '${command ?? ""}'. Try: serve, act, events, status, digest, stop.`,
      );
      return 1;
  }
}

function actorFlag(argv: readonly string[], name: string): Actor {
  const value = extractFlag(argv, name);
  if (value === "agent" || value === "human" || value === "system") return value;
  throw new Error(`${name} must be agent, human, or system`);
}

function numberFlag(argv: readonly string[], name: string): number | undefined {
  const raw = extractFlag(argv, name);
  return raw === undefined ? undefined : Number(raw);
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    processIo.writeErr(`backbrief: unexpected error: ${String(error)}`);
    process.exitCode = 1;
  });
