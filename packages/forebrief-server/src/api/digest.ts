// Module: api/digest -- GET /api/digest, `forebrief digest`'s HTTP target.
import type { Context } from "hono";
import type { CitationRepoAccess, CitationKbAccess, EventStore } from "@brief/core";
import { renderDigest } from "../digest";

export interface DigestRouteDeps {
  repoRoot: string;
  eventStore: EventStore;
  repo: CitationRepoAccess;
  kb: CitationKbAccess;
}

export function digestRoute(deps: DigestRouteDeps) {
  return async (c: Context): Promise<Response> =>
    c.text(await renderDigest(deps.eventStore.readSince(0), deps));
}
