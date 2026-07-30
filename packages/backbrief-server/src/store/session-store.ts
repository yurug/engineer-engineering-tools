// Module: store/session-store -- `.backbrief/sessions/<ulid>.json` records.
//
// Implements the Session half of kb/spec/data-model.md#session and its
// on-disk shape from config-and-formats.md ("Session/finding/proposal
// JSON: pretty-printed (2 spaces, sorted keys) so git diffs of committed
// comprehension state stay reviewable" -- ADR-003).
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { SessionSchema, type Clock, type IdGenerator, type Session } from "@backbrief/shared";
import { resolveBackbriefPath } from "../fsguard";

/**
 * Creates and persists a new active Session record.
 * @param headAtStart the repo's HEAD at session creation, or "unborn" (T1)
 * @invariant T1 accepts "unborn" without special-casing -- it is just a string
 */
export async function createSession(
  repoRoot: string,
  title: string,
  headAtStart: string,
  deps: { clock: Clock; ids: IdGenerator },
): Promise<Session> {
  const session: Session = {
    id: deps.ids.next(),
    repoRoot,
    createdAt: deps.clock.nowIso(),
    status: "active",
    headAtStart,
    title,
  };
  await writeSession(repoRoot, session);
  return session;
}

export async function writeSession(repoRoot: string, session: Session): Promise<void> {
  const validated = SessionSchema.parse(session); // defensive: never persist a malformed record
  const filePath = sessionFilePath(repoRoot, session.id);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  // Sorted keys (config-and-formats.md) -- JSON.stringify preserves
  // insertion order, so we sort explicitly rather than relying on the
  // Session type's field declaration order matching alphabetical.
  const sortedKeys = Object.keys(validated).sort();
  const sorted = Object.fromEntries(
    sortedKeys.map((k) => [k, (validated as Record<string, unknown>)[k]]),
  );
  await fs.writeFile(filePath, JSON.stringify(sorted, null, 2) + "\n", "utf8");
}

export async function readSession(repoRoot: string, sessionId: string): Promise<Session | null> {
  try {
    const raw = await fs.readFile(sessionFilePath(repoRoot, sessionId), "utf8");
    return SessionSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Lists every session's title+createdAt+id, most recent first (digest.ts#last-5-sessions). */
export async function listSessions(repoRoot: string): Promise<Session[]> {
  const dir = resolveBackbriefPath(repoRoot, "sessions");
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }
  const sessions = await Promise.all(
    entries
      .filter((f) => f.endsWith(".json"))
      .map((f) => readSession(repoRoot, f.replace(/\.json$/, ""))),
  );
  return sessions
    .filter((s): s is Session => s !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function sessionFilePath(repoRoot: string, sessionId: string): string {
  return resolveBackbriefPath(repoRoot, path.join("sessions", `${sessionId}.json`));
}
