// Module: lib/brief-content -- decides which of the brief's "This brief"
// content kinds is CURRENT (kb/plan.md R7-2's named unknown: does the
// Established/This-brief/Where-next rhythm hold for a move, a talk slide,
// and a paused-for-change rupture without special-casing the shell?).
//
// ADOPTED CLARIFICATIONS (priority order below, not directly speced --
// interaction-model.md defines the THREE parts of a brief but not a
// cross-kind precedence rule, since in the happy path at most one kind is
// ever live at once):
// 1. `paused`/`proposal` are the two moments of ONE rupture story
//    (pedagogy-engine.md#rupture) and always outrank ordinary agenda
//    content -- a defect being fixed is never something to navigate past.
// 2. An open talk and a `present_move` are mutually exclusive in practice
//    (a move only runs "inside a chosen path", ADR-007 decision 1) but if
//    the stream somehow has both, the talk wins: it is a deliberate,
//    user-paced request the human is actively inside.
// 3. `free-answer` -- the human's OWN most recent typed focus (the "or set
//    your own focus" textbox, interaction-model.md's `choice_made.text`) --
//    is shown ONLY while it is the very last thing in the stream, i.e.
//    nothing (a move, a talk slide, another choice) has responded to it yet.
//    This is the ADR's "a free answer" headline source, made concrete.
// 4. `empty` -- the true cold start, nothing established, nothing chosen,
//    nothing offered yet.
import type { Envelope, MapNode } from "@backbrief/shared/browser";
import type { EnvelopeFrame } from "./use-backbrief-socket";
import type { LiveSessionStatus } from "./session-status";
import type { PendingChangeBreak } from "./change-break";
import { findCurrentTalk, type CurrentTalk } from "./talk-fold";

interface PresentMovePayload {
  nodeId: string;
}
interface ChoiceMadePayload {
  choiceId?: string;
  text?: string;
}

export type BriefContent =
  | { kind: "paused" }
  | { kind: "proposal"; proposal: PendingChangeBreak }
  | { kind: "talk"; talk: CurrentTalk }
  | { kind: "move"; frame: EnvelopeFrame; nodeId: string; node: MapNode | undefined }
  | { kind: "free-answer"; text: string }
  | { kind: "empty" };

/** @returns the most recent present_move frame -- pedagogy-engine.md's move
 *   loop presents exactly one node at a time, so "latest" IS "current". */
function findCurrentMoveFrame(frames: readonly EnvelopeFrame[]): EnvelopeFrame | undefined {
  for (let i = frames.length - 1; i >= 0; i--) {
    if (frames[i]!.envelope.type === "present_move") return frames[i];
  }
  return undefined;
}

/** Agent actions that supersede a human free answer -- i.e. "the agent has
 *  responded". NOT annotations, navigation, or system events (head_changed,
 *  mode_change): those must never clear the brief (interaction-model.md,
 *  "annotations do not hijack the brief"). */
const RESPONDING_TYPES: ReadonlySet<string> = new Set([
  "present_move",
  "offer_choices",
  "talk_start",
  "talk_slide",
  "talk_end",
]);

/** @returns the human's own most recent `choice_made{text}`, shown until the
 *   AGENT responds to it (a move, a new offer, or a talk step). A newer
 *   annotation / navigation / system event does NOT clear it -- only a
 *   responding agent action does (interaction-model.md's free-answer rule,
 *   corrected 2026-07-19: "very last envelope" was too strong; the qualifier
 *   was always "anything newer RESPONDING to it"). */
function findFreeAnswer(envelopes: readonly Envelope[]): string | null {
  for (let i = envelopes.length - 1; i >= 0; i--) {
    const env = envelopes[i]!;
    if (RESPONDING_TYPES.has(env.type)) return null; // agent moved on
    if (env.type !== "choice_made") continue;
    const payload = env.payload as unknown as ChoiceMadePayload;
    return payload.text ?? null; // latest choice_made; text only if free-typed
  }
  return null;
}

/**
 * @param envelopes the full envelope stream, in `seq` order
 * @param frames the same stream as `EnvelopeFrame`s (carries `validation`,
 *   which device rendering needs) -- App.tsx already derives `envelopes`
 *   FROM `frames`, so both are always in the same order
 * @param nodes the live map -- resolves a move's `nodeId` to its question
 * @param sessionStatus `deriveSessionStatus`'s own live fold
 * @param pendingChangeBreak `findPendingChangeBreak`'s own live fold
 * @returns the ONE content kind "This brief" renders right now
 */
export function deriveBriefContent(
  envelopes: readonly Envelope[],
  frames: readonly EnvelopeFrame[],
  nodes: readonly MapNode[],
  sessionStatus: LiveSessionStatus,
  pendingChangeBreak: PendingChangeBreak | null,
): BriefContent {
  if (sessionStatus === "paused-for-change") return { kind: "paused" };
  if (pendingChangeBreak) return { kind: "proposal", proposal: pendingChangeBreak };

  const talk = findCurrentTalk(frames);
  if (talk) return { kind: "talk", talk };

  const moveFrame = findCurrentMoveFrame(frames);
  if (moveFrame) {
    const nodeId = (moveFrame.envelope.payload as unknown as PresentMovePayload).nodeId;
    return { kind: "move", frame: moveFrame, nodeId, node: nodes.find((n) => n.id === nodeId) };
  }

  const freeAnswer = findFreeAnswer(envelopes);
  if (freeAnswer) return { kind: "free-answer", text: freeAnswer };

  return { kind: "empty" };
}
