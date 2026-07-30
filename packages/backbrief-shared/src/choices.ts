// Module: choices -- offer_choices/choice_made shapes, the P12-style word
// budgets on intent/label/hint, and the single-outstanding-offer scoping
// guard for choice_made.
//
// Implements kb/spec/interaction-model.md's "Protocol -- choices" section
// (ADR-007's you-steer reframe: "the agent offers, the human chooses").
// Mirrors pedagogy.ts's/rupture.ts's own split: the zod schema pins
// STRUCTURAL shape only (non-empty strings, the 2-6 choice-count bound);
// word-count budgets and the "exactly one of choiceId/text" cross-field
// rule run in dedicated pure post-parse functions -- a discriminatedUnion
// member can't carry a `.refine`/`.superRefine` (devices.ts's header
// explains why), AND the richer E_OVER_BUDGET/E_VALIDATION contracts
// (naming the exact field) can't be produced by a bare zod issue path
// anyway (pedagogy.ts's own header makes the identical argument).
//
// Key design decision -- the single-outstanding-offer question (this
// step's named unknown, kb/plan.md's R7-1 entry): `choice_made` carries no
// id referencing the `offer_choices` it answers (unlike `move_response.
// moveId`, which names its `present_move`'s own envelope id explicitly).
// Resolved the SAME way server/api/events.ts's own
// `findLatestProposeCheckpoint` already resolves the structurally
// identical `checkpoint_response` ambiguity: attribute to the single MOST
// RECENT `offer_choices` in the stream, full stop -- no new reference
// field added. This is DELIBERATELY simpler than rupture.ts's
// `checkPauseAuthorized` per-proposal attribution fix: that fix exists
// because `propose_change_break` carries an explicit `findingId` and the
// spec allows several proposals open across DIFFERENT findings at once.
// `offer_choices` carries no such identifier, and interaction-model.md's
// own governing rule -- "the agent posts an offer_choices and WAITS... it
// does not auto-advance the agenda past a choice point" -- means there is
// by design at most one open choice point at a time. Adopted as a spec
// clarification; documented in interaction-model.md in this same commit.
import { z } from "zod";
import { AppError, err, ok, type Result } from "@brief/shared";
import { UlidSchema } from "@brief/shared";
import type { Envelope } from "@brief/shared";
import { CitationInputSchema } from "@brief/shared";
import { countWords } from "./word-count";

const ChoiceSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  hint: z.string().min(1).optional(),
});

const OfferChoicesAction = z.object({
  type: z.literal("offer_choices"),
  payload: z.object({
    intent: z.string().min(1),
    // "2-6 choices" (interaction-model.md) is structural, so zod enforces
    // the count directly -- no richer field-naming contract is needed for
    // a bare array-length violation the way the word budgets below need one.
    choices: z.array(ChoiceSchema).min(2).max(6),
  }),
});

const ChoiceMadeEvent = z.object({
  type: z.literal("choice_made"),
  payload: z.object({
    choiceId: z.string().min(1).optional(),
    text: z.string().min(1).optional(),
  }),
});

const EnvelopeFields = z.object({
  refs: z.array(CitationInputSchema).default([]),
  clientKey: UlidSchema.optional(),
});
/** Wired into `ActionSchema`'s union by ./actions.ts. */
export const OfferChoicesActionSchema = OfferChoicesAction.extend(EnvelopeFields.shape);
/** Wired into `EventSchema`'s union by ./events.ts. */
export const ChoiceMadeEventSchema = ChoiceMadeEvent.extend(EnvelopeFields.shape);

export type OfferChoicesPayload = z.infer<typeof OfferChoicesActionSchema>["payload"];
export type ChoiceMadePayload = z.infer<typeof ChoiceMadeEventSchema>["payload"];

const INTENT_WORD_LIMIT = 30;
const LABEL_WORD_LIMIT = 8;
const HINT_WORD_LIMIT = 3;

/**
 * @param payload an already schema-parsed `offer_choices` payload
 * @returns ok(void) if `intent` and every choice's `label`/`hint` are
 *   within budget; otherwise an `E_OVER_BUDGET` AppError naming the exact
 *   field, its word count, and its limit
 * @invariant interaction-model.md's choice budgets -- same hard-reject
 *   shape as pedagogy.ts's `checkMoveBudgets` (P12): the ONLY gate: a
 *   caller that skips it lets an over-budget offer through uncaught
 */
export function checkOfferChoicesBudgets(payload: OfferChoicesPayload): Result<void> {
  const intentCount = countWords(payload.intent);
  if (intentCount > INTENT_WORD_LIMIT) {
    return err(budgetError("intent", intentCount, INTENT_WORD_LIMIT));
  }
  for (const [index, choice] of payload.choices.entries()) {
    const labelCount = countWords(choice.label);
    if (labelCount > LABEL_WORD_LIMIT) {
      return err(budgetError(`choices[${String(index)}].label`, labelCount, LABEL_WORD_LIMIT));
    }
    if (choice.hint !== undefined) {
      const hintCount = countWords(choice.hint);
      if (hintCount > HINT_WORD_LIMIT) {
        return err(budgetError(`choices[${String(index)}].hint`, hintCount, HINT_WORD_LIMIT));
      }
    }
  }
  return ok(undefined);
}

function budgetError(field: string, count: number, limit: number): AppError {
  return new AppError(
    "E_OVER_BUDGET",
    `"${field}" is ${String(count)} words, limit ${String(limit)} (interaction-model.md)`,
    { field, count, limit },
  );
}

/**
 * @param payload an already schema-parsed `choice_made` payload
 * @returns ok(void) if EXACTLY ONE of `choiceId`/`text` is present;
 *   otherwise `E_VALIDATION` -- interaction-model.md: "both absent or both
 *   present -> E_VALIDATION"
 * @invariant structural (not word-budget) -- kept separate from
 *   `checkOfferChoicesBudgets` because it fires on the OTHER message of
 *   this protocol pair, for a shape reason rather than a length one
 */
export function checkChoiceMadeShape(payload: ChoiceMadePayload): Result<void> {
  const hasChoiceId = payload.choiceId !== undefined;
  const hasText = payload.text !== undefined;
  if (hasChoiceId === hasText) {
    return err(
      new AppError("E_VALIDATION", "choice_made requires exactly one of choiceId or text", {
        field: "choiceId|text",
        hasChoiceId,
        hasText,
      }),
    );
  }
  return ok(undefined);
}

/**
 * @param envelopes the FULL cross-session envelope stream (any order --
 *   sorted here by `seq`, matching `checkPauseAuthorized`'s own convention)
 * @param choiceId the `choice_made.choiceId` to attribute
 * @returns ok(void) if `choiceId` names one of the choices offered by the
 *   MOST RECENT `offer_choices` action in the stream; otherwise
 *   `E_VALIDATION` naming the field
 * @invariant this module header's "single-outstanding-offer" decision --
 *   see there for the full rationale and the `checkpoint_response`
 *   precedent it mirrors
 */
export function checkChoiceMadeScope(
  envelopes: readonly Envelope[],
  choiceId: string,
): Result<void> {
  const sorted = [...envelopes].sort((a, b) => a.seq - b.seq);
  const latestOffer = [...sorted].reverse().find((e) => e.type === "offer_choices");
  if (!latestOffer) {
    return err(
      new AppError(
        "E_VALIDATION",
        `choice_made: no offer_choices found to attribute choiceId "${choiceId}" to`,
        { field: "choiceId", choiceId },
      ),
    );
  }
  const offerPayload = latestOffer.payload as unknown as OfferChoicesPayload;
  const known = offerPayload.choices.some((choice) => choice.id === choiceId);
  if (!known) {
    return err(
      new AppError(
        "E_VALIDATION",
        `choice_made: choiceId "${choiceId}" is not among the latest offer_choices' choices`,
        { field: "choiceId", choiceId },
      ),
    );
  }
  return ok(undefined);
}
