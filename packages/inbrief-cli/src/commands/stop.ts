// Module: commands/stop -- `inbrief stop`, ends the server process.
//
// Stopping the SERVER is not closing the SESSION. The steerability statement
// (P7) comes from `close`, which is the engineer's act; this only shuts the
// process down. Conflating them would let a stray `stop` fabricate a closing
// statement nobody asked for.
import { connect, apiBase } from "../discovery";
import { EXIT_ERROR, EXIT_OK, type Io } from "../output";

export interface StopOptions {
  repoStartDir: string;
  io: Io;
}

export async function runStopCommand(opts: StopOptions): Promise<number> {
  const found = await connect(opts.repoStartDir);
  if (!found.ok) {
    opts.io.writeErr(`inbrief: ${found.reason}`);
    return EXIT_ERROR;
  }
  const { info } = found.connection;
  try {
    await fetch(`${apiBase(info)}/api/stop`, {
      method: "POST",
      headers: { Authorization: `Bearer ${info.token}` },
    });
  } catch {
    // The server closing its socket mid-response is the expected shape of
    // success here, so a transport error is not reported as a failure.
  }
  opts.io.writeOut(JSON.stringify({ ok: true }));
  return EXIT_OK;
}
