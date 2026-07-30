// Module: store/reader-state-store -- the live, in-memory ReaderState map
// plus its `.backbrief/reader-state.jsonl` durable checkpoint log.
//
// config-and-formats.md: "reader-state.jsonl: append-only fold checkpoints
// (rebuildable from events)." Correctness lives in ONE place: session event
// logs (already P2/P6-durable). At `open()`, this store REBUILDS its
// in-memory map from a fresh cross-session fold (store/all-sessions.ts +
// shared's pure `foldReaderState`) rather than trusting the jsonl file as a
// second source of truth -- avoiding the two ever silently diverging.
// reader-state.jsonl itself is then treated as a write-mostly audit trail
// (git-diffable, per ADR-003's committable-state philosophy) that mirrors
// the live map: `applyLive` appends one line per CHANGED target, using
// shared's single-step reducer so folding one envelope against the current
// map is provably equivalent to a full rebuild (see reader-state.ts's
// module header).
import * as fs from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import * as path from "node:path";
import { applyReaderStateTransition, type Envelope, type ReaderState } from "@backbrief/shared";
import { resolveBackbriefPath } from "../fsguard";
import { readAllSessionEnvelopesOrdered } from "./all-sessions";

export class ReaderStateStore {
  private fileHandle: FileHandle | null = null;

  private constructor(
    private readonly filePath: string,
    private map: Map<string, ReaderState>,
  ) {}

  /** @invariant P6 rebuilt from a from-zero fold of every session's log -- never trusts a stale checkpoint file. */
  static async open(repoRoot: string): Promise<ReaderStateStore> {
    const ordered = await readAllSessionEnvelopesOrdered(repoRoot);
    const initial = ordered.reduce(applyReaderStateTransition, new Map<string, ReaderState>());
    const filePath = resolveBackbriefPath(repoRoot, "reader-state.jsonl");
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const store = new ReaderStateStore(filePath, initial);
    store.fileHandle = await fs.open(filePath, "a");
    // Persist the freshly-rebuilt snapshot so a fresh checkout of the repo
    // (no reader-state.jsonl yet, or one from before this session existed)
    // still gets an up-to-date, readable-by-external-tooling checkpoint file.
    for (const state of initial.values()) await store.appendLine(state);
    return store;
  }

  /**
   * Applies one live envelope's effect incrementally -- the fast path a
   * running session uses on every event append, instead of re-folding all
   * history each time.
   * @invariant P6 `applyReaderStateTransition` returns the SAME map
   *   reference when nothing changed, so this is a cheap no-op for the
   *   (common) case of an envelope type that never touches reader state
   */
  async applyLive(sessionId: string, envelope: Envelope): Promise<void> {
    const before = this.map;
    const after = applyReaderStateTransition(before, { sessionId, envelope });
    if (after === before) return;
    for (const [targetPath, state] of after) {
      if (before.get(targetPath) !== state) await this.appendLine(state);
    }
    this.map = after;
  }

  snapshot(): ReaderState[] {
    return [...this.map.values()];
  }

  private async appendLine(state: ReaderState): Promise<void> {
    if (!this.fileHandle) throw new Error("ReaderStateStore used after close()");
    await this.fileHandle.appendFile(JSON.stringify(state) + "\n", "utf8");
    await this.fileHandle.sync();
  }

  async close(): Promise<void> {
    await this.fileHandle?.close();
    this.fileHandle = null;
  }
}
