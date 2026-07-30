// Module: api/search -- GET /api/search?q=, the search box's backend.
//
// Added in step 2 -- not in the original api-contracts.md table; documented
// there in the same commit as this file (same-commit rule, CLAUDE.md).
import type { Context } from "hono";
import { searchRepo } from "../search";
import type { Config } from "../store/config";

export interface SearchRouteDeps {
  repoRoot: string;
  config: Config;
}

export function searchRoute(deps: SearchRouteDeps) {
  return async (c: Context): Promise<Response> => {
    const query = c.req.query("q") ?? "";
    const result = await searchRepo(deps.repoRoot, query, deps.config.excludes);
    return c.json({ query, matches: result.matches, truncated: result.truncated });
  };
}
