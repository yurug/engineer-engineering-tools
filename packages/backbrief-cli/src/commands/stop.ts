// Module: commands/stop -- `backbrief stop`.
//
// kb/spec/api-contracts.md#cli: "graceful session_end + shutdown." A thin
// POST to /api/session/end -- the server owns flushing the digest,
// releasing the lock, and exiting (kb/spec/algorithms.md#session-lifecycle).
import { findLiveServer } from "../discovery";
import { authHeaders, baseUrl, errorMessageFrom } from "../http-client";
import { EXIT_ERROR, EXIT_OK, type Io } from "../output";

export async function runStopCommand(deps: { repoStartDir: string; io: Io }): Promise<number> {
  const discovered = await findLiveServer(deps.repoStartDir);
  if (!discovered) {
    deps.io.writeErr("backbrief: no server running for this repo");
    return EXIT_ERROR;
  }
  const res = await fetch(`${baseUrl(discovered.info)}/api/session/end`, {
    method: "POST",
    headers: authHeaders(discovered.info),
  });
  if (!res.ok) {
    // U4 (Phase 5 audit): see commands/digest.ts's identical fix.
    deps.io.writeErr(`backbrief: failed to stop the server: ${await errorMessageFrom(res)}`);
    return EXIT_ERROR;
  }
  deps.io.writeOut(JSON.stringify(await res.json()));
  return EXIT_OK;
}
