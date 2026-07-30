// Module: store/model-store -- the live, in-memory comprehension map +
// overlay, plus their `.backbrief/model/{map,overlay}.json` durable mirrors.
//
// Implements kb/spec/config-and-formats.md#layout's `model/map.json` +
// `model/overlay.json` entries and kb/spec/comprehension-map.md's "both
// files are rewritten atomically (tmp + rename) after their originating
// envelope is durable -- the event log remains the source of truth and
// both files are rebuildable by folding it." Mirrors reader-state-store.ts's
// shape exactly: rebuild from a from-zero cross-session fold at `open()`
// (P6, never trusts a stale checkpoint file), then keep a live snapshot
// updated as envelopes arrive.
// Key design decision: `applyLive` does a FULL re-fold of every envelope
// seen so far, not an incremental update. `foldMap`/`foldOverlay` (shared)
// are already O(envelopes) and map/overlay sizes are deliberately small by
// design (comprehension-map.md's agent note: "prefer 20 load-bearing nodes
// over 60 trivial ones; a session touches 5-15") -- re-folding is cheap
// AND it means there is only ONE place (shared's pure fold) that can ever
// disagree with itself, unlike a hand-maintained incremental mutator that
// could silently drift from the from-zero fold it's supposed to match.
// Durability (Phase 5 audit fix): persist() calls are serialized through a
// FIFO queue (`persistQueue`, mirrors EventStore's `writeQueue`) so the
// on-disk files always reflect the LAST applyLive call, never an
// interleaved older one; each tmp file is fsynced before its rename (like
// EventStore's own fsync-before-ack).
import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  foldMap,
  foldOverlay,
  computeFrontier,
  type Envelope,
  type MapNode,
  type OverlayEntry,
} from "@backbrief/shared";
import { resolveBackbriefPath } from "../fsguard";
import { readAllSessionEnvelopesOrdered } from "./all-sessions";

export interface ModelSnapshot {
  nodes: MapNode[];
  overlay: OverlayEntry[];
  frontier: string[];
}

/** Envelope types either fold ever reads -- skipping everything else avoids a pointless re-fold+rewrite on the (much more common) unrelated envelope. */
const MODEL_RELEVANT_TYPES: ReadonlySet<string> = new Set([
  "map_upsert",
  "present_move",
  "node_response",
  "move_response",
  "nodes_invalidated",
]);

export class ModelStore {
  private envelopes: Envelope[] = [];
  private nodes: MapNode[] = [];
  private overlay: OverlayEntry[] = [];
  // Phase 5 audit fix: FIFO promise-chain mutex serializing persist() calls
  // -- mirrors EventStore's own `writeQueue` (event-store.ts). Without this,
  // two concurrent applyLive calls (e.g. an agent present_move racing a
  // human node_response, both routed through projectEnvelope) each capture
  // `this.nodes`/`this.overlay` synchronously the instant persist() is
  // invoked; their underlying tmp+rename writes then race with no ordering
  // guarantee, so an OLDER-state persist's rename can land AFTER a NEWER
  // one's, regressing the on-disk files to stale content (or, if both
  // persists' tmp paths happen to collide on `pid+Date.now()`, crash with
  // ENOENT). Chaining a THUNK (`() => this.persist()`) rather than an
  // already-invoked promise defers the `this.nodes`/`this.overlay` read
  // itself until the previous persist has fully settled, so a queued
  // persist always sees state at least as fresh as when it was enqueued --
  // impact was bounded (open() always re-folds from the log, P6, so this
  // never corrupted the source of truth) but real for the committable
  // on-disk files between writes.
  private persistQueue: Promise<unknown> = Promise.resolve();

  private constructor(private readonly repoRoot: string) {}

  /** @invariant P6 rebuilt from a from-zero cross-session fold -- never trusts the on-disk json as ground truth. */
  static async open(repoRoot: string): Promise<ModelStore> {
    const ordered = await readAllSessionEnvelopesOrdered(repoRoot);
    const store = new ModelStore(repoRoot);
    store.envelopes = ordered.map((o) => o.envelope);
    store.recompute();
    await store.persist();
    return store;
  }

  /**
   * Folds one freshly-appended envelope's effect in, then persists both
   * files -- called by the SAME `projectEnvelope` chokepoint every other
   * derived store hooks into (server.ts, api/actions.ts, api/events.ts,
   * watch/head-watcher.ts), so a GET /api/map right after a POST always
   * observes it (no eventually-consistent window, matching AppDeps's contract).
   */
  async applyLive(envelope: Envelope): Promise<void> {
    if (!MODEL_RELEVANT_TYPES.has(envelope.type)) return;
    this.envelopes.push(envelope);
    this.recompute();
    await this.enqueuePersist();
  }

  /** @returns the current nodes/overlay/frontier -- what `GET /api/map` serves verbatim. */
  snapshot(): ModelSnapshot {
    return {
      nodes: this.nodes,
      overlay: this.overlay,
      frontier: computeFrontier(this.nodes, this.overlay),
    };
  }

  private recompute(): void {
    this.nodes = foldMap(this.envelopes);
    this.overlay = foldOverlay(this.envelopes);
  }

  /**
   * Queues `this.persist()` behind whatever is already in flight -- see the
   * `persistQueue` field comment for why this must chain a THUNK, not an
   * already-invoked call.
   * @invariant P6-adjacent: persists complete strictly in `applyLive` call
   *   order, so the LAST applyLive to be called is always the last write to
   *   settle on disk.
   */
  private enqueuePersist(): Promise<void> {
    const task = this.persistQueue.then(() => this.persist());
    // Swallow failures on the QUEUE's own continuation only (mirrors
    // EventStore.append) -- `task` itself still carries the real rejection
    // back to this call's caller.
    this.persistQueue = task.catch(() => undefined);
    return task;
  }

  /** @invariant comprehension-map.md#storage atomic tmp+rename write, both files, every time either could have changed. */
  private async persist(): Promise<void> {
    await writeJsonAtomic(resolveBackbriefPath(this.repoRoot, "model/map.json"), {
      version: 1,
      nodes: this.nodes,
    });
    await writeJsonAtomic(resolveBackbriefPath(this.repoRoot, "model/overlay.json"), {
      version: 1,
      entries: this.overlay,
    });
  }
}

/**
 * @invariant config-and-formats.md's "Session JSON: pretty-printed (2
 *   spaces, sorted keys)" convention extended to the model files -- git
 *   diffs of a committed map/overlay stay reviewable
 * @invariant comprehension-map.md#storage tmp+rename: a reader (another
 *   process, or this process's own next `open()`) never observes a
 *   partially-written file, even across a crash mid-write
 * @invariant Phase 5 audit fix: the tmp file is fsynced (open handle,
 *   write, `fh.sync()`, close) BEFORE the rename -- without this, the
 *   rename could be durable (the directory entry now points at the tmp
 *   file's inode) while the tmp file's own CONTENT is still sitting in the
 *   page cache, unflushed; a crash in that window leaves map.json/
 *   overlay.json pointing at zero-length or truncated data. Mirrors
 *   EventStore's own `fileHandle.sync()` P2 discipline (event-store.ts),
 *   just for a tmp+rename writer instead of an append-only one. Directory
 *   fsync (making the rename's directory-entry update itself durable, not
 *   just the file content) is best-effort only -- not every platform/
 *   filesystem supports fsync-ing a directory handle, and losing JUST the
 *   rename's own durability (as opposed to the file's content) after a
 *   crash still self-heals: open()'s from-zero fold rebuilds the source of
 *   truth (P6) regardless.
 */
async function writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const sorted = JSON.stringify(sortKeysDeep(data), null, 2) + "\n";
  const tmpPath = `${filePath}.tmp-${String(process.pid)}-${String(Date.now())}`;
  const fh = await fs.open(tmpPath, "w");
  try {
    await fh.writeFile(sorted, "utf8");
    await fh.sync();
  } finally {
    await fh.close();
  }
  await fs.rename(tmpPath, filePath);
  try {
    const dirHandle = await fs.open(path.dirname(filePath), "r");
    try {
      await dirHandle.sync();
    } finally {
      await dirHandle.close();
    }
  } catch {
    // Best-effort (see @invariant above) -- never fatal.
  }
}

/** Recursively sorts object keys (arrays keep their order -- only key ORDER within objects is nondeterministic across a plain `JSON.stringify`). */
function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) sorted[key] = sortKeysDeep(record[key]);
    return sorted;
  }
  return value;
}
