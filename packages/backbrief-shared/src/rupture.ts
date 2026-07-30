// Module: rupture -- propose_change_break/change_break_response/
// pause_for_change/resume_session shapes, plus the pause-authorization
// guard.
//
// Implements kb/spec/pedagogy-engine.md#rupture (the pause-for-change
// lifecycle) and kb/spec/data-model.md#session's "paused-for-change"
// status. Split into its own domain module rather than folded into
// pedagogy.ts (already at code-style.md's 200-line budget) -- mirrors
// comprehension-map.ts/overlay.ts's own file-per-concern split (ADR-005's
// "v2 payload homes": each spec section's protocol messages get one file).
// Three of the four messages are AGENT actions (propose_change_break,
// pause_for_change, resume_session -- pedagogy-engine.md labels them
// "Action"); `change_break_response` is the one HUMAN event (labelled
// "Event (human)" in the same spec section).
import { z } from "zod";
import { AppError, err, ok, type Result } from "@brief/shared";
import { UlidSchema } from "@brief/shared";
import type { Envelope } from "@brief/shared";
import { CitationInputSchema } from "@brief/shared";

const ProposeChangeBreakAction = z.object({
  type: z.literal("propose_change_break"),
  payload: z.object({
    // The finding this change break fixes -- a `FindingRecord.findingId`
    // (session-fold.ts), i.e. an `open_finding` envelope's own server-
    // assigned id, same ULID-as-foreign-key convention `move_response.
    // moveId` uses against `present_move` (pedagogy.ts).
    findingId: UlidSchema,
    plan: z.string().min(1),
  }),
});

const ChangeBreakResponseEvent = z.object({
  type: z.literal("change_break_response"),
  payload: z.object({ accepted: z.boolean() }),
});

const PauseForChangeAction = z.object({
  type: z.literal("pause_for_change"),
  payload: z.object({ findingId: UlidSchema }),
});

const ResumeSessionAction = z.object({
  type: z.literal("resume_session"),
  payload: z.object({ summary: z.string().min(1) }),
});

const EnvelopeFields = z.object({
  refs: z.array(CitationInputSchema).default([]),
  clientKey: UlidSchema.optional(),
});

/** Wired into `ActionSchema`'s union by ./actions.ts. */
export const ProposeChangeBreakActionSchema = ProposeChangeBreakAction.extend(EnvelopeFields.shape);
/** Wired into `EventSchema`'s union by ./events.ts. */
export const ChangeBreakResponseEventSchema = ChangeBreakResponseEvent.extend(EnvelopeFields.shape);
/** Wired into `ActionSchema`'s union by ./actions.ts. */
export const PauseForChangeActionSchema = PauseForChangeAction.extend(EnvelopeFields.shape);
/** Wired into `ActionSchema`'s union by ./actions.ts. */
export const ResumeSessionActionSchema = ResumeSessionAction.extend(EnvelopeFields.shape);

export type ProposeChangeBreakPayload = z.infer<typeof ProposeChangeBreakActionSchema>["payload"];
export type ChangeBreakResponsePayload = z.infer<typeof ChangeBreakResponseEventSchema>["payload"];
export type PauseForChangePayload = z.infer<typeof PauseForChangeActionSchema>["payload"];
export type ResumeSessionPayload = z.infer<typeof ResumeSessionActionSchema>["payload"];

/**
 * @param envelopes the full cross-session envelope stream (any order
 *   source -- sorted here by `seq` before scanning, matching every other
 *   cross-history check in this codebase, e.g. server/api/events.ts's
 *   `findLatestProposeCheckpoint`)
 * @param findingId the finding `pause_for_change` names
 * @returns ok(void) if a `propose_change_break` for this exact findingId
 *   exists AND the `change_break_response` attributed to it (see below)
 *   accepted; otherwise an `E_VALIDATION` AppError
 * @invariant pedagogy-engine.md#rupture: "pause_for_change {findingId} //
 *   only after acceptance" -- this is the ordering guard that enforces it.
 *   PER-PROPOSAL ATTRIBUTION (spec gap, corrected 2026-07-19 after a real
 *   cross-finding authority bug): `change_break_response` carries no
 *   `findingId` of its own (its shape is bare `{accepted}}`), so each
 *   response must be attributed to a proposal by ORDERING alone. The rule:
 *   a response attributes to the `propose_change_break` with the greatest
 *   `seq` strictly less than the response's own `seq` -- i.e. whichever
 *   proposal was still open (unanswered) at the moment the human replied.
 *   `pause_for_change{findingId}` is authorized iff, among responses
 *   attributed to THAT finding's proposal, the most recent one accepted.
 *   This is NOT "the most recent response after this finding's proposal,
 *   full stop" (the prior, buggy rule): that let an unrelated finding B's
 *   later acceptance wrongly authorize an earlier finding A that the human
 *   had actually DECLINED -- e.g. seq2 declines A, seq4 accepts B; the old
 *   rule authorized pause_for_change{A} because seq4 was "the most recent
 *   response after A's proposal", even though seq4 never answered A at all.
 *   Per-proposal attribution fixes this: seq4 attributes to B (the proposal
 *   open at seq4), never to A.
 * @invariant error code choice: error-taxonomy.md has no dedicated code for
 *   a protocol-ordering violation; `E_VALIDATION`'s contract ("names the
 *   field and expected shape") reads naturally onto "the required prior
 *   acceptance is missing" -- documented here per conventions/error-
 *   handling.md's "adding an error" rule (this is a reuse, not a new code).
 */
export function checkPauseAuthorized(
  envelopes: readonly Envelope[],
  findingId: string,
): Result<void> {
  const sorted = [...envelopes].sort((a, b) => a.seq - b.seq);
  const proposals = sorted.filter((e) => e.type === "propose_change_break");
  const hasProposalForFinding = proposals.some(
    (e) => (e.payload as unknown as ProposeChangeBreakPayload).findingId === findingId,
  );
  if (!hasProposalForFinding) {
    return err(
      new AppError(
        "E_VALIDATION",
        `pause_for_change: no propose_change_break found for findingId "${findingId}"`,
        { field: "findingId", findingId },
      ),
    );
  }

  // Attribute each change_break_response to the proposal that was open when
  // it was posted -- the propose_change_break with the greatest seq strictly
  // less than the response's own seq -- then keep only the most recent
  // response attributed to THIS finding's proposal.
  let latestForFinding: Envelope | undefined;
  for (const response of sorted) {
    if (response.type !== "change_break_response") continue;
    const openProposal = proposals.filter((p) => p.seq < response.seq).at(-1);
    if (
      openProposal &&
      (openProposal.payload as unknown as ProposeChangeBreakPayload).findingId === findingId
    ) {
      latestForFinding = response;
    }
  }

  const accepted =
    latestForFinding !== undefined &&
    (latestForFinding.payload as unknown as ChangeBreakResponsePayload).accepted === true;
  if (!accepted) {
    return err(
      new AppError(
        "E_VALIDATION",
        `pause_for_change: change break for findingId "${findingId}" was not accepted`,
        { field: "findingId", findingId },
      ),
    );
  }
  return ok(undefined);
}
