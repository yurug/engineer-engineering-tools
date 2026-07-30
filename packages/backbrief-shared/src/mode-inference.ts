// Module: mode-inference -- pure fold that decides whether the SYSTEM
// should append a `mode_change` event, plus the plain fold that reads the
// session's current mode off the log.
//
// Implements kb/spec/pedagogy-engine.md#interaction-modes: "`exploring` is
// set explicitly by the human, or inferred by the server after navigation
// events with no move responses for 3 minutes (system-attributed, visible,
// reversible -- never silent)... Return to dialogue... any move/node
// response." This module only computes the WHAT (does the mode need to
// change, and to what); server/watch/mode-watcher.ts is the poll loop that
// calls it on a timer and appends the resulting event, mirroring
// watch/head-watcher.ts's own split between "pure transition logic" and
// "the timer that drives it."
// Key design decision: two SEPARATE triggers, not one state machine walked
// on every envelope -- flipping back to dialogue is EVENT-driven (a
// move_response/node_response landing is itself the signal, checked
// immediately by server/api/events.ts's postEventsRoute so it reads as
// instant, NF2) while inferring exploring is TIME-driven (idleness can't be
// observed from an event, only from the clock, hence the poll). Both reuse
// this file's `foldMode` so "what is the mode right now" has exactly one
// definition.
import type { Envelope } from "@brief/shared";

/** pedagogy-engine.md's literal "3 minutes." */
export const EXPLORING_IDLE_MS = 3 * 60 * 1000;

export type CurrentMode = "dialogue" | "exploring";

interface ModeChangePayload {
  mode: CurrentMode;
}

/**
 * @param envelopes any order (sorted internally by `seq`, P6)
 * @returns the mode as of the last `mode_change` envelope; "dialogue" if none yet (the spec's implicit default -- a session starts in dialogue)
 */
export function foldMode(envelopes: readonly Envelope[]): CurrentMode {
  let mode: CurrentMode = "dialogue";
  for (const envelope of [...envelopes].sort((a, b) => a.seq - b.seq)) {
    if (envelope.type === "mode_change") {
      mode = (envelope.payload as unknown as ModeChangePayload).mode;
    }
  }
  return mode;
}

/**
 * @returns true if the session is CURRENTLY `exploring` (folded) and at
 *   least one `move_response`/`node_response` landed strictly after the
 *   `mode_change` that set it -- the "any move/node response flips back"
 *   rule. Called reactively, right after appending one of those two event
 *   types (server/api/events.ts), not by the poll watcher.
 * @invariant P11-adjacent, not P11 itself: this never touches mastery, only
 *   the mode label -- deliberately checked AFTER the response event is
 *   already durable (P2), so the flip-back is never lost to a crash between
 *   "the response landed" and "the mode flipped."
 */
export function shouldReturnToDialogue(envelopes: readonly Envelope[]): boolean {
  const sorted = [...envelopes].sort((a, b) => a.seq - b.seq);
  if (foldMode(sorted) !== "exploring") return false;
  const lastExploringSeq = lastModeChangeSeq(sorted, "exploring");
  return sorted.some(
    (e) => e.seq > lastExploringSeq && (e.type === "move_response" || e.type === "node_response"),
  );
}

/**
 * @param nowMs the watcher's own clock reading (injected -- code-style.md DI)
 * @returns true if the session should be system-flipped to `exploring` NOW:
 *   currently `dialogue`, at least one `navigation` event exists, and it is
 *   both (a) the most recent "activity" signal (no move/node response came
 *   after it -- a response after a nav means the human is still IN dialogue,
 *   just glancing at code mid-move) and (b) at least `EXPLORING_IDLE_MS` old.
 * @invariant never fires twice for the same idle window -- once the watcher
 *   appends `mode_change{exploring}`, `foldMode` reports `exploring` and
 *   this function short-circuits to false on the very next poll tick.
 */
export function shouldInferExploring(envelopes: readonly Envelope[], nowMs: number): boolean {
  const sorted = [...envelopes].sort((a, b) => a.seq - b.seq);
  if (foldMode(sorted) !== "dialogue") return false;
  const lastNav = lastOfType(sorted, "navigation");
  if (!lastNav) return false;
  const lastTeach = lastOfType(sorted, "move_response") ?? lastOfType(sorted, "node_response");
  const lastNavMs = Date.parse(lastNav.ts);
  const lastTeachMs = lastTeach ? Date.parse(lastTeach.ts) : -Infinity;
  // A response AFTER the last nav means teaching is still live -- the human
  // browsed mid-move, not away from it (module header: this is what makes
  // the two triggers stay non-conflicting instead of racing each other).
  if (lastNavMs <= lastTeachMs) return false;
  return nowMs - lastNavMs >= EXPLORING_IDLE_MS;
}

function lastOfType(sorted: readonly Envelope[], type: string): Envelope | undefined {
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i]!.type === type) return sorted[i];
  }
  return undefined;
}

function lastModeChangeSeq(sorted: readonly Envelope[], mode: CurrentMode): number {
  for (let i = sorted.length - 1; i >= 0; i--) {
    const e = sorted[i]!;
    if (e.type === "mode_change" && (e.payload as unknown as ModeChangePayload).mode === mode) {
      return e.seq;
    }
  }
  return -1;
}
