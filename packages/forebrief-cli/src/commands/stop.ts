// Module: commands/stop -- `forebrief stop`.
//
// kb/spec/cli-contract.md: "Flush digest, end session, shut down." (digest
// flush lands in a later step). Thin HTTP client of the discovered
// server's `POST /api/stop`.
import { findLiveServer } from "../discovery";
import { describeApiError, type ApiError } from "../http-client";
import { EXIT_ERROR, EXIT_OK, type Io } from "../output";

export interface StopOptions {
  repoStartDir: string;
  io: Io;
}

export async function runStopCommand(opts: StopOptions): Promise<number> {
  const found = await findLiveServer(opts.repoStartDir);
  if (!found) {
    opts.io.writeErr("forebrief: no server running for this repo");
    return EXIT_ERROR;
  }
  try {
    const res = await fetch(`http://127.0.0.1:${String(found.info.port)}/api/stop`, {
      method: "POST",
      headers: { Authorization: `Bearer ${found.info.token}` },
    });
    const body = (await res.json()) as { ok?: boolean; error?: ApiError };
    if (!res.ok) {
      const error = body.error ?? { code: "E_INTERNAL", message: `HTTP ${String(res.status)}` };
      opts.io.writeErr(`forebrief: ${describeApiError(error)}`);
      return EXIT_ERROR;
    }
    opts.io.writeOut(JSON.stringify(body));
    return EXIT_OK;
  } catch (error) {
    opts.io.writeErr(`forebrief: ${error instanceof Error ? error.message : String(error)}`);
    return EXIT_ERROR;
  }
}
