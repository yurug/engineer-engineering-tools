// Module: watch/mode-flip -- the EVENT-driven half of interaction-mode
// inference: "any move/node response flips back to dialogue"
// (kb/spec/pedagogy-engine.md#interaction-modes).
//
// Split out of api/events.ts (kept small, on purpose -- that file is
// already a documented code-style.md size exception; growing it further
// for one four-line concern would compound the debt instead of paying it
// down). Called synchronously from postEventsRoute right after a
// move_response/node_response is durable (P2), so the flip reads as
// instant to the human (NF2) rather than waiting on watch/mode-watcher.ts's
// poll tick, which only owns the OTHER (time-driven, "infer exploring
// after 3 idle minutes") direction -- see that module's header for the
// full split between the two triggers.
import { shouldReturnToDialogue, type Envelope } from "@backbrief/shared";
import type { EventStore } from "../store/event-store";

/**
 * @param projectEnvelope keeps derived stores in sync -- same contract as
 *   every other append site (server.ts's `projectEnvelope`)
 * @invariant idempotent -- once the appended `mode_change{dialogue}` is
 *   folded, `shouldReturnToDialogue` reads `dialogue` already and returns
 *   false, so a second response in the same tick never double-appends
 */
export async function flipToDialogueIfExploring(
  eventStore: EventStore,
  projectEnvelope: (envelope: Envelope) => Promise<void>,
): Promise<void> {
  const envelopes = eventStore.readSince(0);
  if (!shouldReturnToDialogue(envelopes)) return;
  const result = await eventStore.append({
    actor: "system",
    type: "mode_change",
    refs: [],
    payload: { mode: "dialogue" },
  });
  await projectEnvelope(result.envelope);
}
