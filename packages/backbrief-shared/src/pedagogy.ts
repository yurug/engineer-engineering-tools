// Module: pedagogy -- `present_move`/`move_response`/`mode_change` shapes
// and the P12 attention-budget checker.
//
// Implements kb/spec/pedagogy-engine.md and kb/properties/functional.md#P12.
// Mirrors comprehension-map.ts's split: the zod schema pins STRUCTURAL shape
// only (non-empty strings, the closed `ask.kind`/`move_response.kind` enums,
// device shape via ./devices.ts); word-count budgets run in
// `checkMoveBudgets`, a pure post-parse function returning the richer
// `E_OVER_BUDGET` contract ("names the field, its count, and the limit" --
// api-contracts.md), which a zod `.refine` path could not produce as
// cleanly (it would report a zod issue PATH, not a human field name plus
// count/limit numbers the agent can act on directly).
// Round-7 (ADR-007, kb/spec/interaction-model.md): `present_move` gains an
// optional `intent` -- the same plain-language "why" sentence a talk/
// offer_choices carries, so a move can state its own intent without a
// separate `offer_choices` wrapping it. `checkDeviceBudgets` is exported
// (was module-private) so `talk.ts` can run the IDENTICAL per-device-kind
// budget table over a talk slide's device -- interaction-model.md: "a talk
// slide is grounded exactly like a move" extends naturally to "budgeted
// exactly like a move" for the device it carries; one table, two callers.
// Key design decision: `present_move` carries NO `question` field --
// pedagogy-engine.md's Rule 0b: "the question shown is the NODE's
// question... the frame is not re-sent." Budget-checking the node's own
// question/answer happens in comprehension-map.ts at `map_upsert` time, not
// here -- the two budgets are enforced at the point each field is actually
// submitted, never re-validated a second time downstream.
import { z } from "zod";
import { AppError, err, ok, type Result } from "@brief/shared";
import { UlidSchema } from "@brief/shared";
import { CitationInputSchema } from "@brief/shared";
import { DeviceSpecSchema, type DeviceSpec, type MemoryGraph } from "./devices";
import { countWords } from "./word-count";

const AskKindSchema = z.enum(["calibration", "prediction", "self-explanation", "transfer", "none"]);

const PresentMoveAction = z.object({
  type: z.literal("present_move"),
  payload: z.object({
    nodeId: z.string().min(1),
    device: DeviceSpecSchema.optional(),
    // Round-7 (interaction-model.md): "<=30 words: the plain 'why' sentence
    // for the brief's 'This brief' line" -- optional so a pre-round-7 move
    // (or one whose intent is already obvious from context) still parses.
    intent: z.string().min(1).optional(),
    say: z.string().min(1),
    ask: z.object({ text: z.string().min(1), kind: AskKindSchema }),
  }),
});

const MoveResponseEvent = z.object({
  type: z.literal("move_response"),
  payload: z.object({
    moveId: UlidSchema, // the present_move action's own envelope id
    kind: z.enum([
      "answer",
      "got-it",
      "not-clear",
      "thats-wrong",
      "show-evidence",
      "step",
      "stall",
    ]),
    text: z.string().min(1).optional(),
  }),
});

/** Human-set explicitly, OR system-inferred after 3 idle minutes
 *  (pedagogy-engine.md) -- NOT in `SYSTEM_EVENT_TYPES` (events.ts), unlike
 *  `head_changed`: a human posting one directly through POST /api/events is
 *  the PRIMARY path, not a forbidden one. */
const ModeChangeEvent = z.object({
  type: z.literal("mode_change"),
  payload: z.object({ mode: z.enum(["dialogue", "exploring"]) }),
});

const EnvelopeFields = z.object({
  refs: z.array(CitationInputSchema).default([]),
  clientKey: UlidSchema.optional(),
});
/** Wired into `ActionSchema`'s union by ./actions.ts. */
export const PresentMoveActionSchema = PresentMoveAction.extend(EnvelopeFields.shape);
/** Wired into `EventSchema`'s union by ./events.ts. */
export const MoveResponseEventSchema = MoveResponseEvent.extend(EnvelopeFields.shape);
export const ModeChangeEventSchema = ModeChangeEvent.extend(EnvelopeFields.shape);

export type PresentMove = z.infer<typeof PresentMoveActionSchema>["payload"];
export type MoveResponsePayload = z.infer<typeof MoveResponseEventSchema>["payload"];

const SAY_WORD_LIMIT = 25;
const ASK_WORD_LIMIT = 15;
/** interaction-model.md: same 30-word cap `offer_choices.intent` carries -- present_move's own `intent` is the identical field, just optional. */
const INTENT_WORD_LIMIT = 30;
const LAW_READING_WORD_LIMIT = 20;
/** Cross-cutting device rule (visual-devices.md): "Labels: <=4 words". Applies to ScenarioStrip's per-strip `label`/token `text`, StateMachine's state `label`/transition `event`, and MemoryGraph's cell `key`/`value`. */
const DEVICE_LABEL_WORD_LIMIT = 4;
/** visual-devices.md's explicit override for ExecutionTrace frames: "say: string // <= 15 words" (step 2). */
const TRACE_FRAME_SAY_WORD_LIMIT = 15;
/** visual-devices.md's explicit override for MemoryGraph: "note?: string // <= 10 words" (step 2). */
const MEMORY_NOTE_WORD_LIMIT = 10;

/**
 * @param move an already schema-parsed `present_move` payload
 * @returns ok(void) if `say`, `ask.text`, and every device label/reading are
 *   within budget; otherwise an `E_OVER_BUDGET` AppError naming the exact
 *   field, its word count, and its limit
 * @invariant P12 hard reject, never trim/warn -- this is the ONLY gate; a
 *   caller that skips it lets an over-budget move through uncaught
 */
export function checkMoveBudgets(move: PresentMove): Result<void> {
  if (move.intent !== undefined) {
    const intentCount = countWords(move.intent);
    if (intentCount > INTENT_WORD_LIMIT) {
      return err(budgetError("intent", intentCount, INTENT_WORD_LIMIT));
    }
  }
  const sayCount = countWords(move.say);
  if (sayCount > SAY_WORD_LIMIT) return err(budgetError("say", sayCount, SAY_WORD_LIMIT));
  const askCount = countWords(move.ask.text);
  if (askCount > ASK_WORD_LIMIT) return err(budgetError("ask.text", askCount, ASK_WORD_LIMIT));
  if (move.device) {
    const deviceViolation = checkDeviceBudgets(move.device);
    if (deviceViolation) return err(deviceViolation);
  }
  return ok(undefined);
}

/**
 * @returns the first device-field budget violation, or null.
 * @invariant P12 every budgeted field visual-devices.md names for EVERY
 *   device kind is checked here -- one exhaustive switch, so a new kind
 *   added to devices.ts without a case here is a compile error (the
 *   `never` fallthrough), not a silently-unchecked field.
 * Exported (round-7): `talk.ts`'s `checkTalkSlideBudgets` reuses this
 * VERBATIM for a talk slide's own optional device -- see this module's
 * header for why one table serves both callers.
 */
export function checkDeviceBudgets(device: DeviceSpec): AppError | null {
  switch (device.kind) {
    case "law": {
      const readingCount = countWords(device.reading);
      if (readingCount > LAW_READING_WORD_LIMIT) {
        return budgetError("device.reading", readingCount, LAW_READING_WORD_LIMIT);
      }
      return null;
    }
    case "scenario": {
      // ScenarioStrip: every strip label and every token text is a "label" (module header).
      for (const [stripIndex, strip] of device.strips.entries()) {
        const labelCount = countWords(strip.label);
        if (labelCount > DEVICE_LABEL_WORD_LIMIT) {
          return budgetError(
            `device.strips[${String(stripIndex)}].label`,
            labelCount,
            DEVICE_LABEL_WORD_LIMIT,
          );
        }
        for (const [tokenIndex, token] of strip.tokens.entries()) {
          const tokenCount = countWords(token.text);
          if (tokenCount > DEVICE_LABEL_WORD_LIMIT) {
            return budgetError(
              `device.strips[${String(stripIndex)}].tokens[${String(tokenIndex)}].text`,
              tokenCount,
              DEVICE_LABEL_WORD_LIMIT,
            );
          }
        }
      }
      return null;
    }
    case "trace": {
      for (const [frameIndex, frame] of device.frames.entries()) {
        const sayCount = countWords(frame.say);
        if (sayCount > TRACE_FRAME_SAY_WORD_LIMIT) {
          return budgetError(
            `device.frames[${String(frameIndex)}].say`,
            sayCount,
            TRACE_FRAME_SAY_WORD_LIMIT,
          );
        }
        // The one sanctioned composite (visual-devices.md): a frame's own
        // embedded memory snapshot obeys MemoryGraph's OWN budgets, at its
        // own nested field path -- not re-derived, just re-scoped.
        if (frame.memory) {
          const violation = checkMemoryGraphBudgets(
            frame.memory,
            `device.frames[${String(frameIndex)}].memory`,
          );
          if (violation) return violation;
        }
      }
      return null;
    }
    case "state-machine": {
      for (const [stateIndex, state] of device.states.entries()) {
        const labelCount = countWords(state.label);
        if (labelCount > DEVICE_LABEL_WORD_LIMIT) {
          return budgetError(
            `device.states[${String(stateIndex)}].label`,
            labelCount,
            DEVICE_LABEL_WORD_LIMIT,
          );
        }
      }
      for (const [transitionIndex, transition] of device.transitions.entries()) {
        const eventCount = countWords(transition.event);
        if (eventCount > DEVICE_LABEL_WORD_LIMIT) {
          return budgetError(
            `device.transitions[${String(transitionIndex)}].event`,
            eventCount,
            DEVICE_LABEL_WORD_LIMIT,
          );
        }
      }
      return null;
    }
    case "memory":
      return checkMemoryGraphBudgets(device, "device");
    // No default: the exhaustiveness check IS the safety net (see @invariant above).
  }
}

/**
 * @param memory the MemoryGraph, whether it is the move's top-level device
 *   or a trace frame's embedded snapshot
 * @param fieldPrefix the E_OVER_BUDGET field path this instance of the
 *   graph lives at (`"device"` at top level, `"device.frames[N].memory"`
 *   embedded) -- lets one function serve both call sites without
 *   duplicating the cell/note walk (module header: DRY across the
 *   composite boundary).
 * @returns the first budget violation among this graph's cells/note, or null.
 */
function checkMemoryGraphBudgets(memory: MemoryGraph, fieldPrefix: string): AppError | null {
  for (const [cellIndex, cell] of memory.cells.entries()) {
    const keyCount = countWords(cell.key);
    if (keyCount > DEVICE_LABEL_WORD_LIMIT) {
      return budgetError(
        `${fieldPrefix}.cells[${String(cellIndex)}].key`,
        keyCount,
        DEVICE_LABEL_WORD_LIMIT,
      );
    }
    const valueCount = countWords(cell.value);
    if (valueCount > DEVICE_LABEL_WORD_LIMIT) {
      return budgetError(
        `${fieldPrefix}.cells[${String(cellIndex)}].value`,
        valueCount,
        DEVICE_LABEL_WORD_LIMIT,
      );
    }
  }
  if (memory.note !== undefined) {
    const noteCount = countWords(memory.note);
    if (noteCount > MEMORY_NOTE_WORD_LIMIT) {
      return budgetError(`${fieldPrefix}.note`, noteCount, MEMORY_NOTE_WORD_LIMIT);
    }
  }
  return null;
}

function budgetError(field: string, count: number, limit: number): AppError {
  return new AppError(
    "E_OVER_BUDGET",
    `"${field}" is ${String(count)} words, limit ${String(limit)} (P12)`,
    { field, count, limit },
  );
}
