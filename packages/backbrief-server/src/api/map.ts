// Module: api/map -- GET /api/map.
//
// Implements kb/spec/comprehension-map.md#read-api: "{nodes, overlay,
// frontier}". The live ModelStore snapshot already reflects every envelope
// folded so far (store/model-store.ts's `applyLive`, hooked into the same
// `projectEnvelope` chokepoint every other route's writes go through), so
// this handler is a thin read -- no separate cache-invalidation logic needed.
import type { Context } from "hono";
import type { ModelStore } from "../store/model-store";

export interface MapRouteDeps {
  modelStore: ModelStore;
}

export function mapRoute(deps: MapRouteDeps) {
  return (c: Context): Response => c.json(deps.modelStore.snapshot());
}
