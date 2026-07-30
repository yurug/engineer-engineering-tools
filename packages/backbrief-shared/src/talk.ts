// Module: talk -- talk_start/talk_slide/talk_end/talk_advance/talk_exit
// shapes, their word budgets, and the slide-index sequencing fold.
//
// Implements kb/spec/interaction-model.md's "Protocol -- talk (present me
// X)" section. Same split rationale as choices.ts/pedagogy.ts: zod pins
// structural shape; word budgets and the cross-envelope "index is 0-based,
// strictly increasing" rule run in pure post-parse functions over the full
// envelope stream (the SAME `deps.eventStore.readSince(0)` -> pure-function
// pattern rupture.ts's `checkPauseAuthorized` established).
// Key design decision -- `talk_slide.device` reuses `DeviceSpecSchema`
// (devices.ts) VERBATIM: a talk slide is "grounded exactly like a move"
// (interaction-model.md), so it accepts the identical 5-kind device
// catalog `present_move` does, with the identical P1 all-broken rejection
// (server/api/action-guards.ts's `rejectIfUngroundedDevice`, widened to
// also match `talk_slide` in the same commit as this file) and the
// identical per-kind label/reading/say/note budgets (pedagogy.ts's
// exported `checkDeviceBudgets`, reused here rather than duplicated -- one
// budget table for every device, whichever message carries it).
import { z } from "zod";
import { AppError, err, ok, type Result } from "@brief/shared";
import { UlidSchema } from "@brief/shared";
import type { Envelope } from "@brief/shared";
import { CitationInputSchema } from "@brief/shared";
import { DeviceSpecSchema } from "./devices";
import { countWords } from "./word-count";
import { checkDeviceBudgets } from "./pedagogy";

const TalkStartAction = z.object({
  type: z.literal("talk_start"),
  payload: z.object({
    // What the talk presents (e.g. "the AOF write path") -- free text, no
    // word cap named in interaction-model.md (unlike `title`, which is the
    // rendered headline and IS capped).
    aspect: z.string().min(1),
    title: z.string().min(1),
    slideCount: z.number().int().positive(),
  }),
});

const TalkSlideAction = z.object({
  type: z.literal("talk_slide"),
  payload: z.object({
    index: z.number().int().nonnegative(),
    say: z.string().min(1),
    device: DeviceSpecSchema.optional(),
    caption: z.string().min(1).optional(),
  }),
});

const TalkEndAction = z.object({
  type: z.literal("talk_end"),
  payload: z.object({ summary: z.string().min(1).optional() }),
});

const TalkAdvanceEvent = z.object({
  type: z.literal("talk_advance"),
  payload: z.object({}),
});

const TalkExitEvent = z.object({
  type: z.literal("talk_exit"),
  payload: z.object({}),
});

const EnvelopeFields = z.object({
  refs: z.array(CitationInputSchema).default([]),
  clientKey: UlidSchema.optional(),
});

/** Wired into `ActionSchema`'s union by ./actions.ts. */
export const TalkStartActionSchema = TalkStartAction.extend(EnvelopeFields.shape);
export const TalkSlideActionSchema = TalkSlideAction.extend(EnvelopeFields.shape);
export const TalkEndActionSchema = TalkEndAction.extend(EnvelopeFields.shape);
/** Wired into `EventSchema`'s union by ./events.ts. */
export const TalkAdvanceEventSchema = TalkAdvanceEvent.extend(EnvelopeFields.shape);
export const TalkExitEventSchema = TalkExitEvent.extend(EnvelopeFields.shape);

export type TalkStartPayload = z.infer<typeof TalkStartActionSchema>["payload"];
export type TalkSlidePayload = z.infer<typeof TalkSlideActionSchema>["payload"];
export type TalkEndPayload = z.infer<typeof TalkEndActionSchema>["payload"];

const TALK_TITLE_WORD_LIMIT = 8;
const TALK_SAY_WORD_LIMIT = 25;
const TALK_CAPTION_WORD_LIMIT = 20;

/** @returns `E_OVER_BUDGET` if `title` exceeds interaction-model.md's 8-word cap. */
export function checkTalkStartBudgets(payload: TalkStartPayload): Result<void> {
  const titleCount = countWords(payload.title);
  if (titleCount > TALK_TITLE_WORD_LIMIT) {
    return err(budgetError("title", titleCount, TALK_TITLE_WORD_LIMIT));
  }
  return ok(undefined);
}

/**
 * @returns `E_OVER_BUDGET` on `say`/`caption`, or (via `checkDeviceBudgets`,
 *   pedagogy.ts) on any embedded device field -- the SAME check
 *   `present_move` runs over its own device, reused rather than re-implemented
 */
export function checkTalkSlideBudgets(payload: TalkSlidePayload): Result<void> {
  const sayCount = countWords(payload.say);
  if (sayCount > TALK_SAY_WORD_LIMIT) return err(budgetError("say", sayCount, TALK_SAY_WORD_LIMIT));
  if (payload.caption !== undefined) {
    const captionCount = countWords(payload.caption);
    if (captionCount > TALK_CAPTION_WORD_LIMIT) {
      return err(budgetError("caption", captionCount, TALK_CAPTION_WORD_LIMIT));
    }
  }
  if (payload.device) {
    const deviceViolation = checkDeviceBudgets(payload.device);
    if (deviceViolation) return err(deviceViolation);
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

/** The current talk's open/closed state and its last posted slide index, as
 *  of the tail of `envelopes` -- P6 pure fold, rebuildable from zero, no new
 *  on-disk file (interaction-model.md#storage--folding). */
export interface TalkState {
  open: boolean;
  /** null = a talk is open but no `talk_slide` has been posted yet. */
  lastSlideIndex: number | null;
}

/**
 * @param envelopes the FULL cross-session envelope stream, any order (sorted here by `seq`)
 * @returns the talk state as of the LAST `talk_start`/`talk_slide`/
 *   `talk_end`/`talk_exit` in the stream
 * @invariant P6 -- talk state is derived, never stored
 */
export function foldTalkState(envelopes: readonly Envelope[]): TalkState {
  const sorted = [...envelopes].sort((a, b) => a.seq - b.seq);
  let open = false;
  let lastSlideIndex: number | null = null;
  for (const envelope of sorted) {
    if (envelope.type === "talk_start") {
      open = true;
      lastSlideIndex = null;
    } else if (envelope.type === "talk_slide" && open) {
      lastSlideIndex = (envelope.payload as unknown as TalkSlidePayload).index;
    } else if (envelope.type === "talk_end" || envelope.type === "talk_exit") {
      open = false;
      lastSlideIndex = null;
    }
  }
  return { open, lastSlideIndex };
}

/**
 * @param envelopes the full stream (folded internally via `foldTalkState`)
 * @param index the incoming `talk_slide.index` to check
 * @returns ok(void) if `index` is 0 for the talk's first slide, or strictly
 *   greater than the previous slide's index otherwise; `E_VALIDATION`
 *   naming the field and both counts on violation
 * @invariant interaction-model.md: "`index` is 0-based, strictly increasing"
 */
export function checkTalkSlideSequencing(
  envelopes: readonly Envelope[],
  index: number,
): Result<void> {
  const state = foldTalkState(envelopes);
  if (!state.open) {
    return err(
      new AppError("E_VALIDATION", "talk_slide posted with no open talk (missing talk_start)", {
        field: "index",
      }),
    );
  }
  if (state.lastSlideIndex === null) {
    if (index !== 0) {
      return err(
        new AppError(
          "E_VALIDATION",
          `talk_slide: first slide must be index 0, got ${String(index)}`,
          { field: "index", got: index, expected: 0 },
        ),
      );
    }
    return ok(undefined);
  }
  if (index <= state.lastSlideIndex) {
    return err(
      new AppError(
        "E_VALIDATION",
        `talk_slide: index must strictly increase (previous ${String(state.lastSlideIndex)}, got ${String(index)})`,
        { field: "index", previous: state.lastSlideIndex, got: index },
      ),
    );
  }
  return ok(undefined);
}
