// Module: comprehension-map -- MapNode shape, the `map_upsert` action, its
// P13 structural checks, and the pure fold that rebuilds `map.json` from
// the event log.
//
// Implements kb/spec/comprehension-map.md (the Map, `map_upsert`) and
// kb/properties/functional.md#P13. Mirrors diagram.ts's split: the zod
// schema pins STRUCTURAL shape only (types, non-empty strings, >=1
// citation) -- word-count budgets and graph-wide checks (cycles, dangling
// refs) need to see the WHOLE batch plus the already-stored map, which a
// single-node zod refine cannot do, so they live in `checkMapUpsert` below,
// run server-side after schema parse, producing the richer
// `E_MAP_VALIDATION` contract ("names the node id and the violated rule",
// error-taxonomy.md) a bare zod issue list could not.
// `checkMapUpsert` is PURE (no I/O, architecture/overview.md) -- citation
// GROUNDING (P1: does this citation resolve?) is NOT checked here; that
// reuses the existing mint -> validate pipeline server-side
// (server/api/actions.ts), the same one every other action's citations go
// through. This function only checks what's knowable from the submitted
// nodes + the current map, with zero I/O.
import { z } from "zod";
import { AppError, err, ok, type Result } from "@brief/shared";
import { CitationInputSchema, type CitationInput } from "@brief/shared";
import { UlidSchema } from "@brief/shared";
import type { Envelope } from "@brief/shared";
import { countWords } from "./word-count";

export const NodeTypeSchema = z.enum([
  "concept",
  "mechanism",
  "property",
  "boundary",
  "rationale",
  "quirk",
]);
export type NodeType = z.infer<typeof NodeTypeSchema>;

export const NodeLevelSchema = z.enum(["system", "subsystem", "mechanism", "code"]);
export type NodeLevel = z.infer<typeof NodeLevelSchema>;

/** P12's budgets on question/answer are NOT refined here -- see module header: checkMapUpsert reports them with the node id, not a bare zod path. */
export const MapNodeSchema = z.object({
  id: z.string().min(1), // stable kebab-case slug, never reused (append-only -- comprehension-map.md)
  type: NodeTypeSchema,
  question: z.string().min(1),
  answer: z.string().min(1),
  level: NodeLevelSchema,
  threshold: z.boolean().optional(),
  // P13's ">=1 citation" rule is enforced in `checkMapUpsert` below, NOT
  // here -- Phase 5 audit fix: a schema-level `.min(1)` made an uncited
  // node fail `ActionSchema.safeParse` before `checkMapUpsert` ever ran,
  // producing a generic E_VALIDATION "malformed action" instead of the
  // E_MAP_VALIDATION-naming-the-node-id contract error-taxonomy.md
  // promises for this exact case ("uncited node").
  citations: z.array(CitationInputSchema),
  requires: z.array(z.string().min(1)),
  partOf: z.string().min(1).optional(),
  contrastsWith: z.array(z.string().min(1)).optional(),
  // Constraints (comprehension-map.md): "an id... may be updated but never
  // deleted (retire with `retired: true` instead)".
  retired: z.boolean().optional(),
  // laconic-bridge.md: a cross-project concept this node's mastery is
  // evidence for. Set ONLY when the concept genuinely travels beyond this
  // repo (a cognitive-science effect, a protocol, a language feature) --
  // NEVER on a repo-specific mechanism. No additional P13 rule attaches to
  // this field (module header: "no new P13 rule needed beyond shape") --
  // it is not a citation, not falsifiable ground, just a pointer the write
  // hook (server/src/laconic/bridge-write-hook.ts) reads when this node
  // reaches `demonstrated`.
  portableConcept: z
    .object({
      id: z.string().min(1),
      domain: z.string().min(1),
    })
    .optional(),
});
export type MapNode = z.infer<typeof MapNodeSchema>;

const MapUpsertAction = z.object({
  type: z.literal("map_upsert"),
  payload: z.object({ nodes: z.array(MapNodeSchema).min(1) }),
});
const MapUpsertEnvelopeFields = z.object({
  refs: z.array(CitationInputSchema).default([]),
  clientKey: UlidSchema.optional(),
});
/** Wired into `ActionSchema`'s union by ./actions.ts -- kept here (not
 *  duplicated there) so the map's protocol surface lives with its domain
 *  module, per ADR-005's own "v2 payload homes" split (data-model.md). */
export const MapUpsertActionSchema = MapUpsertAction.extend(MapUpsertEnvelopeFields.shape);
export type MapUpsertActionPayload = z.infer<typeof MapUpsertActionSchema>["payload"];

const QUESTION_WORD_LIMIT = 12;
const ANSWER_WORD_LIMIT = 30;
/** partOf chains are abstraction hierarchies (comprehension-map.md: "partOf chains must terminate") -- any repo-scale map is nowhere near this deep, so a bound this generous only ever fires on an actual cycle. */
const MAX_PART_OF_DEPTH = 64;

/**
 * @param existingNodes the map as currently stored (may be empty: first upsert)
 * @param batch the nodes this `map_upsert` submits
 * @returns ok(void) if every P13 structural rule holds; otherwise an
 *   `E_MAP_VALIDATION` AppError naming the offending node id and rule
 * @invariant P13 map nodes are citable (schema, `.min(1)` above) and
 *   falsifiable, `requires` is acyclic, ids are append-only (upsert never
 *   deletes -- see `foldMap`), question labels obey P12
 */
export function checkMapUpsert(
  existingNodes: readonly MapNode[],
  batch: readonly MapNode[],
): Result<void> {
  const budgetViolation = batch.find(
    (n) => countWords(n.question) > QUESTION_WORD_LIMIT || countWords(n.answer) > ANSWER_WORD_LIMIT,
  );
  if (budgetViolation) return err(budgetError(budgetViolation));

  // P13: "every node needs >=1 citation" -- moved here from a schema-level
  // `.min(1)` (see MapNodeSchema's comment) so the rejection is
  // E_MAP_VALIDATION naming the node id, matching error-taxonomy.md's
  // "uncited node" case, instead of a generic E_VALIDATION zod issue list.
  const uncited = batch.find((n) => n.citations.length < 1);
  if (uncited) return err(mapError(uncited.id, "node has no citations"));

  // Batch wins over existing for the same id -- this IS an upsert (full-node
  // replacement per id, comprehension-map.md), so graph checks below must
  // see the POST-upsert world, not the pre-upsert one.
  const merged = new Map<string, MapNode>(existingNodes.map((n) => [n.id, n]));
  for (const node of batch) merged.set(node.id, node);

  for (const node of batch) {
    const dangling = node.requires.find((r) => !merged.has(r));
    if (dangling !== undefined)
      return err(
        mapError(node.id, `requires references unknown node id "${dangling}" (dangling ref)`),
      );
    if (node.partOf !== undefined && !merged.has(node.partOf))
      return err(
        mapError(node.id, `partOf references unknown node id "${node.partOf}" (dangling ref)`),
      );
  }

  const cycle = findRequiresCycle(merged);
  if (cycle) return err(mapError(cycle, "requires forms a cycle"));

  // Phase 5 audit fix: a retired prerequisite dead-ends its dependents.
  // computeFrontier (overlay-fold.ts) excludes retired nodes from candidacy,
  // so a retired node's overlay state can never reach grasped/demonstrated
  // -- any non-retired node that still `requires` it can never become
  // frontier again. Scanned over EVERY non-retired node in the merged
  // (post-upsert) set, not just the batch: retiring an EXISTING node X
  // while an untouched, already-stored B still requires it must be caught
  // too, not just a batch that upserts both at once.
  for (const [, node] of merged) {
    if (node.retired) continue;
    const retiredRequirement = node.requires.find((r) => merged.get(r)?.retired === true);
    if (retiredRequirement !== undefined) {
      return err(mapError(node.id, `requires references retired node "${retiredRequirement}"`));
    }
  }

  for (const node of batch) {
    if (node.partOf !== undefined && !partOfChainTerminates(merged, node.id)) {
      return err(mapError(node.id, "partOf chain does not terminate"));
    }
  }

  return ok(undefined);
}

function budgetError(node: MapNode): AppError {
  const field = countWords(node.question) > QUESTION_WORD_LIMIT ? "question" : "answer";
  const limit = field === "question" ? QUESTION_WORD_LIMIT : ANSWER_WORD_LIMIT;
  const count = countWords(field === "question" ? node.question : node.answer);
  const message = `node "${node.id}": ${field} is ${String(count)} words, limit ${String(limit)} (P12)`;
  return new AppError("E_MAP_VALIDATION", message, { nodeId: node.id, field, count, limit });
}

function mapError(nodeId: string, rule: string): AppError {
  return new AppError("E_MAP_VALIDATION", `node "${nodeId}": ${rule}`, { nodeId, rule });
}

/** @returns the id of a node on a `requires` cycle, or null if the graph (over ALL merged nodes, not just the batch) is acyclic. */
function findRequiresCycle(merged: Map<string, MapNode>): string | null {
  const state = new Map<string, "visiting" | "done">();
  const visit = (id: string): string | null => {
    const status = state.get(id);
    if (status === "done") return null;
    if (status === "visiting") return id; // back-edge found -- id is ON the cycle
    state.set(id, "visiting");
    const node = merged.get(id);
    for (const dep of node?.requires ?? []) {
      const found = visit(dep);
      if (found) return found;
    }
    state.set(id, "done");
    return null;
  };
  for (const id of merged.keys()) {
    const found = visit(id);
    if (found) return found;
  }
  return null;
}

/** @returns false if following `partOf` from `startId` loops or exceeds MAX_PART_OF_DEPTH before terminating (no `partOf`). */
function partOfChainTerminates(merged: Map<string, MapNode>, startId: string): boolean {
  const seen = new Set<string>();
  let current: string | undefined = startId;
  for (let depth = 0; depth < MAX_PART_OF_DEPTH; depth++) {
    if (current === undefined) return true; // reached a node with no partOf -- terminated
    if (seen.has(current)) return false; // loop
    seen.add(current);
    current = merged.get(current)?.partOf;
  }
  return false;
}

interface MapUpsertPayload {
  nodes: MapNode[];
}

/**
 * @param envelopes the FULL cross-session envelope stream (any order source
 *   the caller chooses -- server/store/model-store.ts folds session-created
 *   order, matching every other store's "rebuildable from the log" fold)
 * @returns the map as of the last `map_upsert` touching each node id --
 *   full-node replacement per id, append-only (an id is never removed from
 *   the returned array, only ever updated -- retire via `retired: true`)
 * @invariant P6 pure fold, rebuildable from zero; P13's append-only-ids rule
 *   holds by construction: this function has no delete path
 */
export function foldMap(envelopes: readonly Envelope[]): MapNode[] {
  const byId = new Map<string, MapNode>();
  for (const envelope of envelopes) {
    if (envelope.type !== "map_upsert") continue;
    const payload = envelope.payload as unknown as MapUpsertPayload;
    for (const node of payload.nodes) byId.set(node.id, node);
  }
  return [...byId.values()];
}

export type { CitationInput };
