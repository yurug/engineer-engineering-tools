// Module: commands/act -- `forebrief act FILE.json | -` (kb/spec/cli-contract.md).
import { findLiveServer } from "../discovery";
import { readInput } from "../input";
import { postJson, describeApiError } from "../http-client";
import { EXIT_ERROR, EXIT_OK, type Io } from "../output";

export interface ActOptions {
  repoStartDir: string;
  input: string;
  io: Io;
}

export async function runActCommand(opts: ActOptions): Promise<number> {
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

  const result = await postJson<{ id: string; seq: number }>(found.info, "/api/records", parsed);
  if (!result.ok) {
    opts.io.writeErr(`forebrief: ${describeApiError(result.error)}`);
    return EXIT_ERROR;
  }
  opts.io.writeOut(JSON.stringify(result.body));
  return EXIT_OK;
}
