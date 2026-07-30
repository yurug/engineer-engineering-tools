// Module: telemetry -- `.backbrief/telemetry.jsonl`, one line per session.
//
// Implements kb/properties/non-functional.md#NF6: "duration, event counts
// by type, timeToFirstHumanSignal = first human-actor event ts − session
// start. Zero network transmission." This module only ever writes to a
// local file under `.backbrief/` (via fsguard) -- there is no HTTP client,
// no analytics SDK, nothing that could accidentally phone home; NF6's
// "zero network transmission" is true by construction, not by discipline.
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { foldOverlay, type Clock, type Envelope, type Session } from "@backbrief/shared";
import { resolveBackbriefPath } from "./fsguard";

export interface TelemetryLine {
  sessionId: string;
  startedAt: string;
  endedAt: string;
  eventCounts: Record<string, number>;
  /** Milliseconds between session start and the first human-actor event, or null if none occurred (NF6). */
  timeToFirstHumanSignal: number | null;
  /** v2 step 4 (kb/plan.md, NF6): `present_move` ACTIONS this session posted -- the move-loop half of "does the user choose to run sessions" (plan.md step 4's own biggest-unknown measurement). */
  movesPresented: number;
  /** Rejected (never-appended) E_OVER_BUDGET attempts (P12) -- NOT derivable from `envelopes` (module header), supplied by the caller via telemetry-counters.ts. */
  budgetRejections: number;
  /** `move_response{kind:"stall"}` events -- pedagogy-engine.md's device-stepper telemetry: "stall telemetry... is your diagnostic signal." */
  stallEvents: number;
  /** Nodes whose overlay evidence, folded from THIS session's own envelopes only, ended in "demonstrated" (P11's strongest mastery signal). */
  nodesDemonstrated: number;
}

/**
 * @param envelopes THIS session's own envelopes only (telemetry is a
 *   per-session metric, unlike the digest's cross-session folds)
 * @param budgetRejections this process's live E_OVER_BUDGET rejection count
 *   (server/telemetry-counters.ts) -- the one field this function cannot
 *   fold from `envelopes` itself (see `TelemetryLine.budgetRejections`)
 * @invariant NF6 appends exactly one line per session, at session_end
 */
export async function writeTelemetryLine(
  repoRoot: string,
  session: Session,
  envelopes: readonly Envelope[],
  clock: Clock,
  budgetRejections: number,
): Promise<void> {
  const eventCounts = countByType(envelopes);
  const line: TelemetryLine = {
    sessionId: session.id,
    startedAt: session.createdAt,
    endedAt: session.endedAt ?? clock.nowIso(),
    eventCounts,
    timeToFirstHumanSignal: timeToFirstHumanSignalMs(session.createdAt, envelopes),
    movesPresented: eventCounts["present_move"] ?? 0,
    budgetRejections,
    stallEvents: countMoveResponseKind(envelopes, "stall"),
    nodesDemonstrated: foldOverlay(envelopes).filter((e) => e.state === "demonstrated").length,
  };
  const filePath = resolveBackbriefPath(repoRoot, "telemetry.jsonl");
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const handle = await fs.open(filePath, "a");
  try {
    await handle.appendFile(JSON.stringify(line) + "\n", "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function countByType(envelopes: readonly Envelope[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const envelope of envelopes) counts[envelope.type] = (counts[envelope.type] ?? 0) + 1;
  return counts;
}

/** @returns how many `move_response` envelopes in THIS session carried the given `kind` -- `"stall"` is the only caller today, but the helper stays generic (mirrors `countByType`'s own shape). */
function countMoveResponseKind(envelopes: readonly Envelope[], kind: string): number {
  return envelopes.filter(
    (e) => e.type === "move_response" && (e.payload as { kind?: string }).kind === kind,
  ).length;
}

function timeToFirstHumanSignalMs(
  startedAt: string,
  envelopes: readonly Envelope[],
): number | null {
  const firstHuman = envelopes.find((e) => e.actor === "human");
  if (!firstHuman) return null;
  return new Date(firstHuman.ts).getTime() - new Date(startedAt).getTime();
}
