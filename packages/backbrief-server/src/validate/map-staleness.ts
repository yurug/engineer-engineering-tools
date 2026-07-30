// Module: validate/map-staleness -- which map nodes have a citation that no
// longer validates, so the caller can emit `nodes_invalidated`.
//
// Implements kb/spec/comprehension-map.md's overlay rule: "`invalidated` --
// SYSTEM only, mechanical: a node citation went drifted|broken during
// revalidation (head_changed, session start, /api/revalidate)." Two
// callers use this: watch/head-watcher.ts (scoped to the paths that just
// changed) and server.ts's startup (unscoped -- session start checks
// EVERY node once, since the repo could have moved while no session was
// running). Both reuse the SAME validate/citation.ts functions every other
// citation check in the codebase uses -- no second validation path.
import type { Citation, Envelope, MapNode, OverlayEntry } from "@backbrief/shared";
import type { RepoAccess } from "../repo";
import type { KbAccess } from "../kb-access";
import type { EventStore } from "../store/event-store";
import type { ModelSnapshot } from "../store/model-store";
import { validateCodeCitation, validateKbCitation } from "./citation";

/**
 * @param nodes the current map
 * @param overlay the current overlay (used only to skip nodes ALREADY
 *   `invalidated` -- P11: "human evidence is never overwritten" implies
 *   re-invalidating an already-invalidated node would just pile up
 *   redundant staleness evidence for no new information)
 * @param changedPaths scope the scan to nodes citing one of these repo-
 *   relative paths (head_changed's own changedPaths); omit to check every
 *   node (session start -- comprehension-map.md's third trigger)
 * @returns node ids whose citations are no longer all "valid"
 * @invariant P13/P11 this function only DETECTS staleness -- it never
 *   mutates overlay state itself; the caller appends `nodes_invalidated`
 *   and lets the normal fold (shared/overlay-fold.ts) apply it, same
 *   separation-of-concerns as every other derived-state update in this codebase
 */
export async function computeStaleNodeIds(
  nodes: readonly MapNode[],
  overlay: readonly OverlayEntry[],
  deps: { repo: RepoAccess; kb: KbAccess },
  changedPaths?: readonly string[],
): Promise<string[]> {
  const changedSet = changedPaths ? new Set(changedPaths) : null;
  const invalidatedIds = new Set(
    overlay.filter((e) => e.state === "invalidated").map((e) => e.nodeId),
  );
  const stale: string[] = [];
  for (const node of nodes) {
    if (node.retired || invalidatedIds.has(node.id)) continue;
    if (changedSet && !node.citations.some((c) => c.kind === "code" && changedSet.has(c.path)))
      continue;
    if (await hasInvalidCitation(node, deps)) stale.push(node.id);
  }
  return stale;
}

export interface MapStalenessDeps {
  repo: RepoAccess;
  kb: KbAccess;
  eventStore: EventStore;
  modelStore: { snapshot(): ModelSnapshot };
  /** Keeps derived stores (annotationStore, readerStateStore, modelStore itself) in sync -- same contract as every other append site. */
  projectEnvelope: (envelope: Envelope) => Promise<void>;
}

/**
 * The one place `computeStaleNodeIds` is turned into a durable
 * `nodes_invalidated` event -- previously duplicated inline at TWO call
 * sites (server.ts's session-start pass and watch/head-watcher.ts's
 * head_changed pass); factored out here so a THIRD trigger (`resume_session`,
 * kb/plan.md step 4: "citation recheck, overlay staleness pass, nodes_
 * invalidated emission -- REUSE the existing head_changed/session-start
 * staleness machinery, do not fork it") calls the exact same shape instead
 * of forking a new copy. `computeStaleNodeIds` itself still only DETECTS
 * (module header above); this wraps detection with the append+project side
 * effect every caller needs identically.
 * @param cause `nodes_invalidated.cause` -- "head_changed" for the watcher,
 *   "revalidate" for both the session-start AND resume_session triggers
 *   (comprehension-map.md#overlay's own third-trigger wording: "session
 *   start... POST /api/revalidate" share this same cause value; resume is
 *   functionally a session restarting its revalidation)
 * @param changedPaths scope to nodes citing one of these paths (head_changed);
 *   omit to check every node (session start / resume -- the unscoped case)
 * @returns the invalidated node ids (empty if nothing went stale)
 */
export async function runMapStalenessPass(
  deps: MapStalenessDeps,
  cause: "head_changed" | "revalidate",
  changedPaths?: readonly string[],
): Promise<string[]> {
  const snapshot = deps.modelStore.snapshot();
  const staleNodeIds = await computeStaleNodeIds(
    snapshot.nodes,
    snapshot.overlay,
    deps,
    changedPaths,
  );
  if (staleNodeIds.length > 0) {
    const result = await deps.eventStore.append({
      actor: "system",
      type: "nodes_invalidated",
      refs: [],
      payload: { nodeIds: staleNodeIds, cause },
    });
    await deps.projectEnvelope(result.envelope);
  }
  return staleNodeIds;
}

/** @returns true if any of `node`'s citations are NOT `"valid"` when checked fresh (P1's re-check-at-read-time philosophy). */
async function hasInvalidCitation(
  node: MapNode,
  deps: { repo: RepoAccess; kb: KbAccess },
): Promise<boolean> {
  for (const citation of node.citations) {
    // By the time a citation is stored (post map_upsert ingest), it is
    // already minted -- see server/mint.ts's assertMinted invariant, which
    // every append path enforces before the event ever reaches disk.
    const minted = citation as Citation;
    const result =
      minted.kind === "code"
        ? await validateCodeCitation(minted, deps.repo)
        : await validateKbCitation(minted, deps.kb);
    if (result.state !== "valid") return true;
  }
  return false;
}
