// Module: api/coverage -- GET /api/coverage, per kb/spec/api-contracts.md's
// row ("coverage map" -> `{targets, counts}`).
import type { Context } from "hono";
import type { RepoAccess } from "../repo";
import type { Config } from "../store/config";
import type { ReaderStateStore } from "../store/reader-state-store";
import { computeCoverage } from "../coverage";

export interface CoverageRouteDeps {
  repo: RepoAccess;
  config: Config;
  readerStateStore: ReaderStateStore;
}

export function coverageRoute(deps: CoverageRouteDeps) {
  return async (c: Context): Promise<Response> => {
    const map = await computeCoverage(deps.repo, deps.config, deps.readerStateStore.snapshot());
    return c.json(map);
  };
}
