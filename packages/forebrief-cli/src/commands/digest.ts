// Module: commands/digest -- `forebrief digest` (kb/spec/cli-contract.md).
import { findLiveServer } from "../discovery";
import { getText, describeApiError } from "../http-client";
import { EXIT_ERROR, EXIT_OK, type Io } from "../output";

export interface DigestOptions {
  repoStartDir: string;
  io: Io;
}

export async function runDigestCommand(opts: DigestOptions): Promise<number> {
  const found = await findLiveServer(opts.repoStartDir);
  if (!found) {
    opts.io.writeErr("forebrief: no server running for this repo -- run `forebrief serve`");
    return EXIT_ERROR;
  }
  const result = await getText(found.info, "/api/digest");
  if (!result.ok) {
    opts.io.writeErr(`forebrief: ${describeApiError(result.error)}`);
    return EXIT_ERROR;
  }
  opts.io.writeOut(result.body);
  return EXIT_OK;
}
