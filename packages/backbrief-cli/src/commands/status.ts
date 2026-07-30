// Module: commands/status -- `backbrief status`.
//
// kb/spec/api-contracts.md#cli: "{running, sessionId, url, agentSeen,
// humanSeen} or {running:false}". Never errors on "no server" -- that IS
// the answer, not a failure (T8: "no hangs, no retry loops").
import { findLiveServer } from "../discovery";
import { authHeaders, baseUrl } from "../http-client";
import { EXIT_OK, type Io } from "../output";

interface SessionResponse {
  session: { id: string };
  presence: { agentSeen: string | null; humanSeen: string | null };
}

export async function runStatusCommand(deps: { repoStartDir: string; io: Io }): Promise<number> {
  const discovered = await findLiveServer(deps.repoStartDir);
  if (!discovered) {
    deps.io.writeOut(JSON.stringify({ running: false }));
    return EXIT_OK;
  }
  const res = await fetch(`${baseUrl(discovered.info)}/api/session`, {
    headers: authHeaders(discovered.info),
  });
  if (!res.ok) {
    // Discovery found artifacts but the server didn't answer -- treat it
    // the same as "not running" rather than surfacing a transport error;
    // `status` is a health check, not a hard failure path.
    deps.io.writeOut(JSON.stringify({ running: false }));
    return EXIT_OK;
  }
  const body = (await res.json()) as SessionResponse;
  deps.io.writeOut(
    JSON.stringify({
      running: true,
      sessionId: body.session.id,
      url: discovered.info.url,
      agentSeen: body.presence.agentSeen,
      humanSeen: body.presence.humanSeen,
    }),
  );
  return EXIT_OK;
}
