// Module: store/event-store -- the append-only JSONL event log: fsync-
// before-ack, gapless `seq`, `clientKey` idempotent-retry dedupe, torn-line
// repair at open.
//
// Extracted from @backbrief/server (ADR-001's "event-store + log codec...
// with the log path parameterized"). WHY `open` takes a `filePath` rather
// than `(repoRoot, sessionId)` (kb/external/backbrief-internals.md's
// extraction finding, confirmed at plan step 1): backbrief writes one log
// per SESSION (`.backbrief/events/<id>.jsonl`); forebrief writes one log
// per REPO (`.forebrief/decisions.jsonl`). There is no shared naming rule
// to hardcode here, so the caller resolves its own path (through its own
// fsguard-wrapped state-dir helper) and passes the resolved, already-
// confined path in. Everything else -- the write-queue serialization, the
// fsync-before-ack durability guarantee, torn-line repair -- is identical
// between consumers and moves unchanged.
// Key design decision: appends are serialized through an in-process promise
// chain (`writeQueue`), not a filesystem lock -- a single Node process is
// the only writer an EventStore instance will ever have, so a promise
// chain is sufficient and needs no OS lock.
import * as fs from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import * as path from "node:path";
import {
  type Actor,
  type Citation,
  type Clock,
  type Envelope,
  type IdGenerator,
  EnvelopeSchema,
} from "@brief/shared";
import { parseLines, readFileOrEmpty } from "./event-log-codec";

export { readEnvelopeLog } from "./event-log-codec";

export interface AppendInput {
  actor: Actor;
  type: string;
  refs: Citation[];
  payload: object;
  clientKey?: string;
}

export interface AppendResult {
  id: string;
  seq: number;
  /** true if `clientKey` had already been seen -- the original {id,seq} is returned, nothing new was appended. */
  deduped: boolean;
  /** The full stored envelope -- lets a caller update its own derived/projection stores without a second lookup. */
  envelope: Envelope;
}

export class EventStore {
  private seq = 0;
  private readonly log: Envelope[] = [];
  private readonly clientKeyIndex = new Map<string, { id: string; seq: number }>();
  private readonly subscribers = new Set<(envelope: Envelope) => void>();
  private fileHandle: FileHandle | null = null;
  private writeQueue: Promise<unknown> = Promise.resolve();

  private constructor(
    private readonly filePath: string,
    private readonly deps: { ids: IdGenerator; clock: Clock },
  ) {}

  /** Rebuilds seq/clientKey-index/log purely by folding the file -- no external state. */
  static async open(
    filePath: string,
    deps: { ids: IdGenerator; clock: Clock },
  ): Promise<EventStore> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const store = new EventStore(filePath, deps);
    await store.loadAndRepair();
    store.fileHandle = await fs.open(filePath, "a");
    return store;
  }

  /** A torn (unparsable) final line is truncated away and logged; earlier lines are untouched. */
  private async loadAndRepair(): Promise<void> {
    const raw = await readFileOrEmpty(this.filePath);
    if (raw === "") return;
    const hasTrailingNewline = raw.endsWith("\n");
    const lines = (hasTrailingNewline ? raw.slice(0, -1) : raw).split("\n");
    const { envelopes, tornAt } = parseLines(lines, this.filePath);
    for (const envelope of envelopes) this.absorb(envelope);
    // Normalize on disk if repair happened OR the file was missing its
    // final newline (a narrow crash window where the content write landed
    // but the terminator didn't) -- otherwise the next append would land
    // on the same physical line as the last one.
    if (tornAt !== null || !hasTrailingNewline) {
      await this.rewriteNormalized(envelopes, tornAt, lines.length);
    }
  }

  private absorb(envelope: Envelope): void {
    this.log.push(envelope);
    this.seq = Math.max(this.seq, envelope.seq);
    if (envelope.clientKey)
      this.clientKeyIndex.set(envelope.clientKey, { id: envelope.id, seq: envelope.seq });
  }

  private async rewriteNormalized(
    envelopes: Envelope[],
    tornAt: number | null,
    totalLines: number,
  ): Promise<void> {
    if (tornAt !== null) {
      console.warn(
        `[event-store] repaired torn line in ${this.filePath}: dropped 1 incomplete line, kept ${envelopes.length} of ${totalLines}`,
      );
    }
    const content = envelopes.map((e) => JSON.stringify(e) + "\n").join("");
    await fs.writeFile(this.filePath, content, "utf8");
  }

  /** Resolves only after the write is fsynced; seq assignment is serialized through `writeQueue`. */
  async append(input: AppendInput): Promise<AppendResult> {
    const task = this.writeQueue.then(() => this.doAppend(input));
    // Swallow failures on the QUEUE's continuation only -- `task` (returned
    // below) still carries the real rejection to this call's caller.
    this.writeQueue = task.catch(() => undefined);
    return task;
  }

  private async doAppend(input: AppendInput): Promise<AppendResult> {
    if (input.clientKey) {
      const existing = this.clientKeyIndex.get(input.clientKey);
      if (existing) {
        // The retried envelope is still in `this.log` (never evicted) --
        // look it up rather than reconstructing a second copy.
        const envelope = this.log.find((e) => e.seq === existing.seq)!;
        return { ...existing, deduped: true, envelope };
      }
    }
    const seq = this.seq + 1;
    const envelope: Envelope = {
      id: this.deps.ids.next(),
      seq,
      ts: this.deps.clock.nowIso(),
      actor: input.actor,
      type: input.type,
      refs: input.refs,
      payload: input.payload,
      ...(input.clientKey !== undefined ? { clientKey: input.clientKey } : {}),
    };
    if (!this.fileHandle) throw new Error("EventStore used after close()");
    assertReadable(envelope);
    await this.fileHandle.appendFile(JSON.stringify(envelope) + "\n", "utf8");
    await this.fileHandle.sync(); // fsync before ack
    this.absorb(envelope);
    for (const notify of this.subscribers) notify(envelope);
    return { id: envelope.id, seq, deduped: false, envelope };
  }

  /** Everything with seq > N, in order (the log is append-ordered already) -- the cursor-replay contract. */
  readSince(sinceSeq: number): Envelope[] {
    return this.log.filter((e) => e.seq > sinceSeq);
  }

  /** @returns an unsubscribe function. Used by SSE/WS follow-style consumers to push new envelopes live. */
  subscribe(onAppend: (envelope: Envelope) => void): () => void {
    this.subscribers.add(onAppend);
    return () => this.subscribers.delete(onAppend);
  }

  async close(): Promise<void> {
    await this.fileHandle?.close();
    this.fileHandle = null;
  }
}

/**
 * Refuses to write an envelope this module's own reader would reject.
 *
 * @throws {Error} naming the offending field
 * @invariant symmetry with `parseLines`. Validating only on read (the state
 *   before this, found dogfooding inbrief 2026-07-28) means a faulty id
 *   generator appends happily and produces a log that can never be reopened.
 *   Every in-memory test passes and the failure surfaces later, somewhere else,
 *   as a corrupt-log error. Appends are human-paced in every brief-family
 *   consumer, so one schema parse per append costs nothing worth having.
 */
function assertReadable(envelope: Envelope): void {
  const parsed = EnvelopeSchema.safeParse(envelope);
  if (parsed.success) return;
  const first = parsed.error.issues[0];
  const at = first ? first.path.map(String).join(".") : "";
  const detail = first ? `${at === "" ? "" : at + ": "}${first.message}` : "schema rejected it";
  // The id hint is conditional on purpose: a blanket "check your id generator"
  // is actively misleading when the offending field is a citation hash, which
  // is what the first run of this check actually surfaced.
  const hint = at === "id" ? " Ids must be ULIDs; check the id generator." : "";
  throw new Error(
    `refusing to append an envelope this log could not read back (${detail}).${hint}`,
  );
}
