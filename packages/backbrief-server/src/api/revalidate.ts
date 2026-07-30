// Module: api/revalidate -- POST /api/revalidate.
//
// Implements kb/spec/api-contracts.md's row: `{paths: string[]}` ->
// "fresh validation states for citations touching those paths". Shares its
// core with the HEAD watcher (validate/revalidate.ts's `revalidatePaths`)
// and, like the watcher, also pushes the result as a `validation_update` WS
// frame (api-contracts.md#websocket-browser-only: "pushed after
// `head_changed` revalidation OR `/api/revalidate`") -- so a client that
// explicitly asks for a refresh brings every OTHER connected tab up to date
// too, not just itself.
//
// v2 (ADR-005, Phase 5 audit fix): comprehension-map.md names this route as
// the THIRD trigger of the map's staleness pass ("head_changed, session
// start, POST /api/revalidate"), alongside watch/head-watcher.ts's
// head_changed pass and server.ts's session-start pass -- this route was
// the only one of the three that never actually ran it. Wired in AFTER
// `revalidatePaths` (card citations) so both scans complete before either
// is broadcast/durable, same ordering `applyTransition` (head-watcher.ts)
// uses for its own two scans. Scoped to `paths`, mirroring `revalidatePaths`
// itself and head_changed's own changedPaths scoping -- an explicit refresh
// request only re-checks the paths the caller named.
import type { Context } from "hono";
import { AppError, type CitationValidationResult, type Envelope } from "@backbrief/shared";
import type { EventStore } from "../store/event-store";
import type { RepoAccess } from "../repo";
import type { KbAccess } from "../kb-access";
import type { WsHub } from "../ws/hub";
import type { ModelStore } from "../store/model-store";
import { revalidatePaths } from "../validate/revalidate";
import { runMapStalenessPass } from "../validate/map-staleness";

export interface RevalidateRouteDeps {
  eventStore: EventStore;
  repo: RepoAccess;
  kb: KbAccess;
  wsHub: WsHub;
  /** v2 (ADR-005): the current map -- runMapStalenessPass's third caller (kb/plan.md step 4's "reuse the existing... machinery, do not fork it"). */
  modelStore: ModelStore;
  /** Keeps derived stores (modelStore itself, among others) in sync with the `nodes_invalidated` envelope this route may append -- same contract every other append site uses. */
  projectEnvelope: (envelope: Envelope) => Promise<void>;
}

function extractPaths(body: unknown): string[] {
  const paths = (body as { paths?: unknown } | null)?.paths;
  if (!Array.isArray(paths) || !paths.every((p): p is string => typeof p === "string")) {
    throw new AppError("E_VALIDATION", "paths must be a string array", { field: "paths" });
  }
  return paths;
}

export function revalidateRoute(deps: RevalidateRouteDeps) {
  return async (c: Context): Promise<Response> => {
    const paths = extractPaths(await c.req.json());
    const updates: CitationValidationResult[] = await revalidatePaths(paths, deps);
    deps.wsHub.broadcastValidationUpdate(updates);
    if (paths.length > 0) {
      await runMapStalenessPass(deps, "revalidate", paths);
    }
    return c.json({ results: updates });
  };
}
