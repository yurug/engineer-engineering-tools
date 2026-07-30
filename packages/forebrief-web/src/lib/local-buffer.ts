// Module: lib/local-buffer -- T2's local buffer (kb/properties/edge-
// cases.md#T2: "holds composed-but-unsent answers in a local buffer
// (localStorage, keyed by repo path + card id -- it must survive into the
// NEW page the human opens, since re-serve mints new tokens and the old
// tab's URL is dead). On reconnect through the new URL the buffer
// replays...").
//
// Keyed by repoRoot (GET /api/state's own field, added this step for
// exactly this) at the top level, by card id underneath -- repoRoot is the
// one identity that survives a kill + re-serve unchanged (new tokens, new
// port, same repo path), which is why the key is NEVER the token or origin.
// @invariant P5-adjacent: a submission is never dropped on a failed POST --
//   only removed from the buffer once the server has acked it.
import { postRecord, type ApiConfig } from "./api";
import type { RecordSubmission } from "./types";

export interface BufferedEntry {
  submission: RecordSubmission;
  /** The client clock's moment of composition -- stamped as `decided_at`
   *  on replay for a `decision` submission (T9-style retroactive-logging
   *  evidence: the digest/UI can show "logged retroactively" for a
   *  decision whose envelope `ts` is long after this). */
  composedAt: string;
}

type BufferShape = Record<string, BufferedEntry[]>;

const KEY_PREFIX = "forebrief:pending:";

function storageKey(repoRoot: string): string {
  return KEY_PREFIX + repoRoot;
}

function readBuffer(repoRoot: string): BufferShape {
  const raw = window.localStorage.getItem(storageKey(repoRoot));
  if (!raw) return {};
  try {
    return JSON.parse(raw) as BufferShape;
  } catch {
    return {}; // corrupted entry -- never throw the whole app over stored junk
  }
}

function writeBuffer(repoRoot: string, all: BufferShape): void {
  window.localStorage.setItem(storageKey(repoRoot), JSON.stringify(all));
}

/** Appends one composed-but-unsent submission for `cardId`. */
export function bufferSubmission(
  repoRoot: string,
  cardId: string,
  submission: RecordSubmission,
  composedAt: string,
): void {
  const all = readBuffer(repoRoot);
  all[cardId] = [...(all[cardId] ?? []), { submission, composedAt }];
  writeBuffer(repoRoot, all);
}

/** @returns every card id with at least one buffered entry, for the
 *   "pending" indicator a card view can show while offline. */
export function pendingCardIds(repoRoot: string): string[] {
  const all = readBuffer(repoRoot);
  return Object.keys(all).filter((cardId) => (all[cardId]?.length ?? 0) > 0);
}

function stampDecidedAt(entry: BufferedEntry): RecordSubmission {
  if (entry.submission.kind !== "decision") return entry.submission;
  if (entry.submission.decided_at !== undefined) return entry.submission;
  return { ...entry.submission, decided_at: entry.composedAt };
}

/**
 * Replays every buffered entry for `repoRoot` against the CURRENT server
 * (a fresh origin/token after re-serve -- the caller supplies today's
 * `api`, this module never remembers one). Entries that fail again (the
 * server is still gone, or genuinely rejects the payload) stay buffered
 * for the next attempt; nothing already acked is ever re-sent twice.
 * @returns how many entries were newly acked and how many remain buffered
 */
export async function replayBuffer(
  repoRoot: string,
  api: ApiConfig,
): Promise<{ replayed: number; remaining: number }> {
  const all = readBuffer(repoRoot);
  const survivors: BufferShape = {};
  let replayed = 0;

  for (const [cardId, entries] of Object.entries(all)) {
    const stillPending: BufferedEntry[] = [];
    for (const entry of entries) {
      try {
        await postRecord(api, stampDecidedAt(entry));
        replayed += 1;
      } catch {
        stillPending.push(entry);
      }
    }
    if (stillPending.length > 0) survivors[cardId] = stillPending;
  }

  writeBuffer(repoRoot, survivors);
  const remaining = Object.values(survivors).reduce((sum, entries) => sum + entries.length, 0);
  return { replayed, remaining };
}
