// Module: store/event-log-codec -- parses an append-only JSONL event log,
// tolerating a torn final line (the crash-recovery contract every brief-
// core consumer relies on), shared by the live writer (./event-store.ts)
// and read-only cross-log readers.
//
// Extracted from @backbrief/server (ADR-001). WHY the log's file PATH is a
// parameter here rather than computed from `(repoRoot, sessionId)`
// (kb/external/backbrief-internals.md's extraction finding): backbrief
// writes one log per session (`events/<id>.jsonl`) but forebrief writes one
// log per REPO (`decisions.jsonl`) -- there is no single "compute the path"
// rule both consumers share, so the caller (which DOES know its own
// on-disk layout) resolves the path via fsguard and passes the result in.
import * as fs from "node:fs/promises";
import { EnvelopeSchema, type Envelope } from "@brief/shared";

export async function readFileOrEmpty(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

/**
 * Parses each line as an Envelope.
 *
 * @invariant only a MALFORMED-JSON line is tolerated, and only at the very last
 *   position: that is the torn-write signature, because a truncated append
 *   leaves unterminated JSON. A line that parses as JSON and then fails the
 *   Envelope schema is corruption at any position, including the last, and is
 *   raised. Conflating the two (dogfooding finding, 2026-07-28) meant a log
 *   whose only record carried a bad id was silently emptied and reported as
 *   "repaired" -- data loss presented as recovery.
 */
export function parseLines(
  lines: string[],
  filePath: string,
): { envelopes: Envelope[]; tornAt: number | null } {
  const envelopes: Envelope[] = [];
  for (let i = 0; i < lines.length; i++) {
    const parsed = parseEnvelopeLine(lines[i]!);
    if (parsed.ok) {
      envelopes.push(parsed.envelope);
      continue;
    }
    const where = `line ${i + 1} of ${lines.length}`;
    if (parsed.reason === null) {
      // Malformed JSON. Torn only if it is last; anywhere earlier is corruption.
      if (i === lines.length - 1) return { envelopes, tornAt: i };
      throw new Error(
        `corrupt event log at ${filePath}: ${where} is not valid JSON`,
      );
    }
    throw new Error(
      `corrupt event log at ${filePath}: ${where} parsed as JSON but is not a valid Envelope (${parsed.reason})`,
    );
  }
  return { envelopes, tornAt: null };
}

/**
 * @returns the envelope, or why it failed: `reason: null` means the line was not
 *   JSON at all, a string means it was JSON the schema rejected
 * @invariant the two failures are distinguished on purpose. The old code
 *   reported both as "not valid JSON", which sent a reader to the JSON layer for
 *   a problem two layers down.
 */
function parseEnvelopeLine(
  line: string,
): { ok: true; envelope: Envelope } | { ok: false; reason: string | null } {
  let json: unknown;
  try {
    json = JSON.parse(line);
  } catch {
    return { ok: false, reason: null };
  }
  const parsed = EnvelopeSchema.safeParse(json);
  if (parsed.success) return { ok: true, envelope: parsed.data as Envelope };
  return { ok: false, reason: describeIssue(parsed) };
}

/** @returns the first schema complaint as "path: message", e.g. "id: must be a ULID". */
function describeIssue(parsed: {
  error: {
    issues: readonly { path: readonly PropertyKey[]; message: string }[];
  };
}): string {
  const first = parsed.error.issues[0];
  if (!first) return "schema rejected the line";
  const at = first.path.map(String).join(".");
  return at === "" ? first.message : `${at}: ${first.message}`;
}

/**
 * Read-only replay of one event log at `filePath`, tolerating a torn final
 * line WITHOUT rewriting the file -- unlike `EventStore.open`, this is for
 * cross-log folds (a digest, a reconciliation pass) that read historical,
 * possibly-ended logs and must never have write side effects on disk.
 * @param filePath the log's already-resolved, already-fsguard-checked path
 *   (callers own their own on-disk layout -- see module header)
 * @returns every well-formed envelope in seq order, or `[]` if the file doesn't exist
 */
export async function readEnvelopeLog(filePath: string): Promise<Envelope[]> {
  const raw = await readFileOrEmpty(filePath);
  if (raw === "") return [];
  const lines = (raw.endsWith("\n") ? raw.slice(0, -1) : raw).split("\n");
  return parseLines(lines, filePath).envelopes;
}
