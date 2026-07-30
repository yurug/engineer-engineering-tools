// Module: commands/digest -- `backbrief digest`.
//
// kb/spec/api-contracts.md#cli: "prints the state digest (markdown) to
// stdout." The one CLI command whose stdout is deliberately not JSON/JSONL
// -- the taxonomy's stdout contract (api-contracts.md#conventions) is
// scoped to the other five commands; the digest's whole purpose is being
// `cat`-able by the agent (config-and-formats.md's agent notes).
import { findLiveServer } from "../discovery";
import { authHeaders, baseUrl, errorMessageFrom } from "../http-client";
import { EXIT_ERROR, EXIT_OK, type Io } from "../output";

export async function runDigestCommand(deps: { repoStartDir: string; io: Io }): Promise<number> {
  const discovered = await findLiveServer(deps.repoStartDir);
  if (!discovered) {
    deps.io.writeErr("backbrief: no server running for this repo (run `backbrief serve` first)");
    return EXIT_ERROR;
  }
  const res = await fetch(`${baseUrl(discovered.info)}/api/state-digest`, {
    headers: authHeaders(discovered.info),
  });
  if (!res.ok) {
    // U4 (Phase 5 audit): was a bare `HTTP <status>`, discarding the
    // server's own `{error:{message}}` -- act.ts already surfaced this
    // correctly; the other five commands hadn't.
    deps.io.writeErr(`backbrief: failed to fetch the digest: ${await errorMessageFrom(res)}`);
    return EXIT_ERROR;
  }
  deps.io.writeOut((await res.text()).trimEnd());
  return EXIT_OK;
}
