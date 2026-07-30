#!/usr/bin/env node
// Module: bin/inbrief -- the entry point. Dispatch and nothing else.
//
// Every command's real work lives in ../commands/, taking an injected Io, so the
// only thing untested here is the argv-to-options mapping.
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { parseArgv, stringFlag, numberFlag } from "../args";
import { processIo, EXIT_ERROR, EXIT_OK } from "../output";
import { runServeCommand } from "../commands/serve";
import { runActCommand } from "../commands/act";
import { runStatusCommand } from "../commands/status";
import { runStopCommand } from "../commands/stop";
import { runProposeCommand } from "../commands/propose";

const COMMANDS = ["serve", "act", "status", "propose", "stop"] as const;

async function main(): Promise<number> {
  const parsed = parseArgv(process.argv.slice(2));
  const cwd = process.cwd();
  const io = processIo;

  switch (parsed.command) {
    case "serve":
      return runServeCommand({
        repo: stringFlag(parsed, "repo") ?? cwd,
        ...(numberFlag(parsed, "port") !== undefined ? { port: numberFlag(parsed, "port")! } : {}),
        open: parsed.flags.get("open") === true,
        io,
        daemonEntryPath: path.join(__dirname, "daemon-entry.js"),
      });
    case "act": {
      const file = parsed.positional[0] ?? stringFlag(parsed, "file");
      if (file === undefined) {
        io.writeErr("inbrief: act needs a FILE.json or - for stdin");
        return EXIT_ERROR;
      }
      return runActCommand({
        file,
        repoStartDir: cwd,
        io,
        readFile: (f) => fs.readFile(f, "utf8"),
        readStdin,
      });
    }
    case "status":
      return runStatusCommand({ repoStartDir: cwd, io });
    case "propose": {
      const out = stringFlag(parsed, "out");
      return runProposeCommand({ repoStartDir: cwd, io, ...(out !== undefined ? { out } : {}) });
    }
    case "stop":
      return runStopCommand({ repoStartDir: cwd, io });
    case undefined:
      io.writeErr(`inbrief: no command. Try: ${COMMANDS.join(", ")}`);
      return EXIT_ERROR;
    default:
      io.writeErr(`inbrief: unknown command '${parsed.command}'. Try: ${COMMANDS.join(", ")}`);
      return EXIT_ERROR;
  }
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: string[] = [];
    process.stdin.setEncoding("utf8");
    // setEncoding("utf8") makes these strings at runtime, but the typings still
    // say Buffer; String() states the conversion instead of relying on `+`.
    process.stdin.on("data", (chunk) => chunks.push(String(chunk)));
    process.stdin.on("end", () => resolve(chunks.join("")));
    process.stdin.on("error", reject);
  });
}

void main().then((code) => {
  process.exitCode = code;
  return EXIT_OK;
});
