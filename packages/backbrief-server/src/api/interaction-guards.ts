// Module: api/interaction-guards -- the offer_choices/talk_* action guards
// and the choice_made event guard, shared by api/actions.ts and
// api/events.ts.
//
// Split out of both route files for the same reason rupture-guards.ts
// already is (that module's own header): each concern gets one home, the
// route handlers stay sequencing-only. One module serves BOTH route files
// (rather than a guards file per route) because every guard here has the
// identical shape -- delegate to a pure `shared/` function, throw its
// `AppError` on failure -- so splitting them into an actions-only file and
// an events-only file would just be two nearly-identical wrappers.
import {
  checkChoiceMadeScope,
  checkChoiceMadeShape,
  checkOfferChoicesBudgets,
  checkTalkSlideBudgets,
  checkTalkSlideSequencing,
  checkTalkStartBudgets,
  type ChoiceMadePayload,
  type OfferChoicesPayload,
  type Result,
  type TalkSlidePayload,
  type TalkStartPayload,
} from "@backbrief/shared";
import type { EventStore } from "../store/event-store";

/** The subset every guard below needs -- both ActionsRouteDeps and
 *  EventsRouteDeps satisfy this structurally, so callers pass their own
 *  deps bag straight through (same convention as rupture-guards.ts's
 *  `RuptureGuardDeps`). */
export interface InteractionGuardDeps {
  eventStore: EventStore;
}

/** @throws {AppError} E_OVER_BUDGET (interaction-model.md's intent/label/hint caps). */
export function assertOfferChoicesValid(payload: OfferChoicesPayload): void {
  throwIfErr(checkOfferChoicesBudgets(payload));
}

/** @throws {AppError} E_OVER_BUDGET (interaction-model.md's 8-word title cap). */
export function assertTalkStartValid(payload: TalkStartPayload): void {
  throwIfErr(checkTalkStartBudgets(payload));
}

/**
 * @throws {AppError} E_OVER_BUDGET on say/caption/device fields
 * @throws {AppError} E_VALIDATION if `index` violates the "0-based,
 *   strictly increasing" sequencing rule (`checkTalkSlideSequencing`)
 */
export function assertTalkSlideValid(deps: InteractionGuardDeps, payload: TalkSlidePayload): void {
  throwIfErr(checkTalkSlideBudgets(payload));
  throwIfErr(checkTalkSlideSequencing(deps.eventStore.readSince(0), payload.index));
}

/**
 * @throws {AppError} E_VALIDATION if both/neither of choiceId/text are
 *   present, or (this step's named unknown, resolved in shared/choices.ts's
 *   module header) `choiceId` doesn't match the latest `offer_choices`' own choices
 */
export function assertChoiceMadeValid(
  deps: InteractionGuardDeps,
  payload: ChoiceMadePayload,
): void {
  throwIfErr(checkChoiceMadeShape(payload));
  if (payload.choiceId !== undefined) {
    throwIfErr(checkChoiceMadeScope(deps.eventStore.readSince(0), payload.choiceId));
  }
}

/** Unwraps a `shared`-produced `Result`, throwing its `AppError` on failure
 *  -- the one place pure/Result-returning checks cross into these routes'
 *  throw-based boundary (conventions/error-handling.md), same helper
 *  api/actions.ts defines locally for its own map_upsert/present_move checks. */
function throwIfErr(result: Result<void>): void {
  if (!result.ok) throw result.error;
}
