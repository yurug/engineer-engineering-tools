// Module: api/stop -- POST /api/stop: flushes the digest, ends the
// session, releases the lock, exits.
//
// kb/spec/cli-contract.md#stop: "Flush digest, end session, shut down."
// Not part of the documented HTTP surface table (that page's own scope
// note: "NOT covered: internal HTTP routing (implementation)") -- this
// route is this implementation's choice of transport for it, mirroring
// backbrief's `POST /api/session/end` precedent under forebrief's own name.
import type { Context } from "hono";
import * as fs from "node:fs/promises";
import type { CitationRepoAccess, CitationKbAccess, EventStore } from "@brief/core";
import { resolveForebriefPath } from "../fsguard";
import { renderDigest } from "../digest";

export interface StopRouteDeps {
  repoRoot: string;
  eventStore: EventStore;
  repo: CitationRepoAccess;
  kb: CitationKbAccess;
  /** Schedules shutdown -- called synchronously, but the actual close()
   *  happens after this handler's response has had a moment to flush to
   *  the client (mirrors brief-core's session-lifecycle pattern: never
   *  close the socket the response itself is riding on). */
  onStop: () => void;
}

/** @invariant config-and-formats.md: `digest.md` is git-tracked, written only through fsguard's `.forebrief/` confinement (P3). */
async function flushDigest(deps: StopRouteDeps): Promise<void> {
  const markdown = await renderDigest(deps.eventStore.readSince(0), deps);
  await fs.writeFile(resolveForebriefPath(deps.repoRoot, "digest.md"), markdown, "utf8");
}

export function stopRoute(deps: StopRouteDeps) {
  return async (c: Context): Promise<Response> => {
    await flushDigest(deps);
    deps.onStop();
    return c.json({ ok: true });
  };
}
