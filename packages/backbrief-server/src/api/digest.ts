// Module: api/digest -- GET /api/state-digest.
//
// algorithms.md#state-digest-generation: "At session_end (AND ON DEMAND)."
// This route regenerates fresh on every request (never serves a cached
// file) so an agent calling `backbrief digest` mid-session sees current
// state, not a stale snapshot from the last session_end -- P6's "derived
// state is always rebuildable" applied to the one artifact the agent is
// told is "safe to read wholesale at session start" (config-and-
// formats.md): safe implies current, not merely present.
import type { Context } from "hono";
import type { Clock } from "@backbrief/shared";
import { generateDigest } from "../digest";
import type { RepoAccess } from "../repo";
import type { Config } from "../store/config";
import type { ModelStore } from "../store/model-store";

export interface DigestRouteDeps {
  repoRoot: string;
  repo: RepoAccess;
  config: Config;
  clock: Clock;
  /** v2 (ADR-005): the digest's "Comprehension map" section source. */
  modelStore: ModelStore;
}

export function stateDigestRoute(deps: DigestRouteDeps) {
  return async (c: Context): Promise<Response> => {
    const digest = await generateDigest(deps.repoRoot, deps);
    return c.text(digest);
  };
}
