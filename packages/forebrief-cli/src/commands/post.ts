// Module: commands/post -- `forebrief post FILE.json | -`
// (kb/spec/cli-contract.md).
//
// Dispatches on the input's top-level key (data-model.md: "post dispatches
// on the top-level key (cards vs card)") to one of TWO server routes --
// `POST /api/rounds` (atomic) or `POST /api/cards` (trickle) -- per cli-
// contract.md's HTTP surface table, which documents them as distinct routes.
import { findLiveServer } from "../discovery";
import { readInput } from "../input";
import { postJson, describeApiError } from "../http-client";
import { EXIT_ERROR, EXIT_FLAGGED, EXIT_OK, type Io } from "../output";
import type { CardValidationReport } from "@forebrief/server";

export interface PostOptions {
  repoStartDir: string;
  input: string;
  io: Io;
}

function routeFor(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  if ("cards" in body) return "/api/rounds";
  if ("card" in body) return "/api/cards";
  return null;
}

export async function runPostCommand(opts: PostOptions): Promise<number> {
  const found = await findLiveServer(opts.repoStartDir);
  if (!found) {
    opts.io.writeErr("forebrief: no server running for this repo -- run `forebrief serve`");
    return EXIT_ERROR;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await readInput(opts.input));
  } catch (error) {
    opts.io.writeErr(`forebrief: ${error instanceof Error ? error.message : String(error)}`);
    return EXIT_ERROR;
  }

  const path = routeFor(parsed);
  if (!path) {
    opts.io.writeErr(
      'forebrief: input must have a top-level "cards" (round) or "card" (trickle) key',
    );
    return EXIT_ERROR;
  }

  const result = await postJson<CardValidationReport[]>(found.info, path, parsed);
  if (!result.ok) {
    opts.io.writeErr(`forebrief: ${describeApiError(result.error)}`);
    return EXIT_ERROR;
  }

  let anyFlagged = false;
  for (const entry of result.body) {
    opts.io.writeOut(JSON.stringify(entry));
    if (entry.citations.some((c) => c.status === "flagged")) anyFlagged = true;
  }
  return anyFlagged ? EXIT_FLAGGED : EXIT_OK;
}
