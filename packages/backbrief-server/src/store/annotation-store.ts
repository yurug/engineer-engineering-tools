// Module: store/annotation-store -- `.backbrief/annotations.jsonl`, the
// derived (latest-wins per annotationId) projection of `annotation` events.
//
// config-and-formats.md: "append-only; latest record per annotation id
// wins." The event log (store/event-store.ts) already durably records
// every `annotation` event (P2/P6, unchanged from step 1); this store is a
// fast-access PROJECTION of it, keyed by annotationId, so the triage panel
// and annotation list never re-fold the whole event log just to answer
// "what does this annotation currently say" -- the same "durable log +
// derived checkpoint" shape reader-state-store.ts uses for ReaderState.
// contextHash (algorithms.md#annotation-anchoring-and-relocation) is
// computed ONCE, when the annotation event is applied, and persisted with
// the record -- relocation (validate/relocate.ts) reads it back rather
// than recomputing it from a citation's now-possibly-stale position.
import * as fs from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import * as path from "node:path";
import { hashContext, type Citation, type Envelope } from "@backbrief/shared";
import { resolveBackbriefPath } from "../fsguard";
import type { RepoAccess } from "../repo";
import { splitRealLines } from "../repo";

export interface AnnotationRecord {
  annotationId: string;
  citation: Citation;
  text: string;
  kind: "note" | "concern" | "disagree";
  /** Only set for code citations -- data-model.md has no context concept for KB citations. */
  contextHash?: string;
  archived: boolean;
  updatedAt: string;
  sessionId: string;
}

interface AnnotationPayload {
  annotationId: string;
  citation: Citation;
  text: string;
  kind: "note" | "concern" | "disagree";
  archived?: boolean;
}

export class AnnotationStore {
  private records = new Map<string, AnnotationRecord>();
  private fileHandle: FileHandle | null = null;

  private constructor(
    private readonly filePath: string,
    private readonly repo: RepoAccess,
  ) {}

  static async open(repoRoot: string, repo: RepoAccess): Promise<AnnotationStore> {
    const filePath = resolveBackbriefPath(repoRoot, "annotations.jsonl");
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const store = new AnnotationStore(filePath, repo);
    await store.load();
    store.fileHandle = await fs.open(filePath, "a");
    return store;
  }

  /** @invariant T9 a torn (unparsable) final line is tolerated and dropped; earlier lines are trusted as-is. */
  private async load(): Promise<void> {
    let raw: string;
    try {
      raw = await fs.readFile(this.filePath, "utf8");
    } catch {
      return;
    }
    const lines = raw.split("\n").filter((line) => line.trim() !== "");
    for (const line of lines) {
      const record = tryParse(line);
      if (record) this.records.set(record.annotationId, record); // last line per id wins by construction (Map overwrite)
    }
  }

  /**
   * Projects one already-appended `annotation` envelope into the store.
   * Non-`annotation` envelopes are ignored (a cheap no-op) -- callers may
   * feed every envelope through this uniformly rather than filtering first.
   * @invariant P2 called AFTER the envelope is durably in the event log --
   *   this store's own durability (fsync below) is a secondary guarantee,
   *   not the primary one (event-store.ts already provided that)
   */
  async apply(sessionId: string, envelope: Envelope): Promise<void> {
    if (envelope.type !== "annotation") return;
    const payload = envelope.payload as unknown as AnnotationPayload;
    const contextHash = await this.computeContextHash(payload.citation);
    const record: AnnotationRecord = {
      annotationId: payload.annotationId,
      citation: payload.citation,
      text: payload.text,
      kind: payload.kind,
      archived: payload.archived ?? false,
      updatedAt: envelope.ts,
      sessionId,
      ...(contextHash !== undefined ? { contextHash } : {}),
    };
    this.records.set(record.annotationId, record);
    await this.appendLine(record);
  }

  private async computeContextHash(citation: Citation): Promise<string | undefined> {
    if (citation.kind !== "code") return undefined;
    const content = await this.repo.readAtRev(citation.rev, citation.path);
    if (content === null) return undefined; // citation was already broken at creation time -- relocation will find that out too
    return hashContext(splitRealLines(content), citation.startLine, citation.endLine);
  }

  list(): AnnotationRecord[] {
    return [...this.records.values()];
  }

  private async appendLine(record: AnnotationRecord): Promise<void> {
    if (!this.fileHandle) throw new Error("AnnotationStore used after close()");
    await this.fileHandle.appendFile(JSON.stringify(record) + "\n", "utf8");
    await this.fileHandle.sync();
  }

  async close(): Promise<void> {
    await this.fileHandle?.close();
    this.fileHandle = null;
  }
}

function tryParse(line: string): AnnotationRecord | null {
  try {
    return JSON.parse(line) as AnnotationRecord;
  } catch {
    return null;
  }
}
