// Module: devices -- the v2 visual-device schemas a `present_move` may carry.
//
// Implements kb/spec/visual-devices.md. Step 1 (kb/plan.md) shipped the two
// static devices, `law` (LawCard) and `scenario` (ScenarioStrip). Step 2
// adds the three dynamic/composite devices: `trace` (ExecutionTrace),
// `state-machine` (StateMachine), and `memory` (MemoryGraph) -- the pure
// extension the step-1 header predicted, now with one extra wrinkle:
// `state-machine`'s cross-field checks (state-id integrity: `initial` must
// name a real state, every transition's `from`/`to` must name real states)
// cannot live on `StateMachineObjectSchema` itself as a `.refine`, because
// `z.discriminatedUnion` requires every member to stay a plain `ZodObject`
// (a `.refine`/`.superRefine` wrapper turns it into a `ZodEffects`, which
// the union rejects at schema-construction time). Those checks are instead
// layered on `DeviceSpecSchema` AFTER the union is built (see the bottom of
// this file) -- the identical shape DiagramSpecSchema's own `.refine` uses
// (diagram.ts), just applied one level up so it can still discriminate on
// `kind` first. Reported paths (`ctx.addIssue({path: [...]})`) are relative
// to `DeviceSpecSchema`, so a violation surfaces as
// `payload.device.initial` (or `.transitions[i].from`) in the flattened
// zod issue list `E_VALIDATION` returns (error-handling.md) -- "names the
// field" without any bespoke error-formatting code.
// Key design decision: every element (token, law, frame, state, transition,
// cell) carries its OWN `citations: Citation[]` with >=1 entry --
// visual-devices.md's cross-cutting constraint, enforced structurally via
// zod `.min(1)` exactly like DiagramSpec's nodes/edges (diagram.ts), for
// the identical reason (P1: a citation-less element cannot exist by
// construction, not by runtime check). Word-count budgets on labels/
// reading/say/note (P12) are enforced by pedagogy.ts's `checkMoveBudgets`,
// NOT here -- this module only pins the STRUCTURAL shape (max element
// counts, required citations, state-id integrity); the word-count walk
// needs a device-kind-agnostic list of "which fields are labels", which
// lives alongside the other P12 budget logic so all four budgeted fields
// (question/say/ask.text/labels) are checked in one place.
import { z } from "zod";
import { CitationInputSchema } from "@brief/shared";

const ScenarioTokenSchema = z.object({
  text: z.string().min(1),
  state: z.enum(["ok", "torn", "gone"]).optional(),
  citations: z.array(CitationInputSchema).min(1, "every token needs >=1 citation (P1)"),
});

const ScenarioStripEntrySchema = z.object({
  label: z.string().min(1),
  tokens: z.array(ScenarioTokenSchema).max(5, "a strip holds at most 5 tokens"),
});

/** "What happens if X?" -- before/after token strips (visual-devices.md). */
export const ScenarioStripSchema = z.object({
  kind: z.literal("scenario"),
  strips: z.array(ScenarioStripEntrySchema).max(2, "at most 2 strips (before/after)"),
});
export type ScenarioStrip = z.infer<typeof ScenarioStripSchema>;

/** "What exactly is guaranteed?" -- the exact law + a plain-language reading. */
export const LawCardSchema = z.object({
  kind: z.literal("law"),
  // Verbatim math/code allowed, no word cap (visual-devices.md) -- the LAW
  // is the citation's own content restated, not a summary subject to P12.
  statement: z.string().min(1),
  reading: z.string().min(1),
  citations: z.array(CitationInputSchema).min(1, "a law needs >=1 citation (P1)"),
});
export type LawCard = z.infer<typeof LawCardSchema>;

const MemoryCellSchema = z.object({
  key: z.string().min(1),
  value: z.string().min(1),
  ttl: z.string().min(1).optional(),
  citations: z.array(CitationInputSchema).min(1, "every memory cell needs >=1 citation (P1)"),
});

/**
 * "What does the store look like now?" -- a snapshot of key/value cells.
 * Doubles as the ONE sanctioned composite: `ExecutionTraceFrameSchema`
 * below embeds this same schema verbatim (visual-devices.md: "trace frames
 * may embed a memory snapshot" -- no other device kind nests a device).
 */
export const MemoryGraphSchema = z.object({
  kind: z.literal("memory"),
  cells: z.array(MemoryCellSchema).max(6, "a memory graph holds at most 6 cells"),
  // <=10 words (visual-devices.md's explicit override of the generic
  // 4-word label budget) -- checked in pedagogy.ts, not here.
  note: z.string().min(1).optional(),
});
export type MemoryGraph = z.infer<typeof MemoryGraphSchema>;

const ExecutionTraceFrameSchema = z.object({
  // <=15 words (visual-devices.md's explicit override) -- checked in pedagogy.ts.
  say: z.string().min(1),
  citations: z.array(CitationInputSchema).min(1, "every trace frame needs >=1 citation (P1)"),
  memory: MemoryGraphSchema.optional(),
});

/** "What happens, step by step?" -- a user-stepped sequence of frames (P14: never autoplay). */
export const ExecutionTraceSchema = z.object({
  kind: z.literal("trace"),
  input: z.string().min(1), // the concrete case, e.g. "SET x 1" -- verbatim, no word cap (same reasoning as LawCard.statement)
  frames: z
    .array(ExecutionTraceFrameSchema)
    .min(1, "a trace needs at least 1 frame")
    .max(8, "a trace holds at most 8 frames"),
});
export type ExecutionTrace = z.infer<typeof ExecutionTraceSchema>;

const StateMachineStateSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1), // <=4 words (generic label budget) -- checked in pedagogy.ts
  citations: z.array(CitationInputSchema).min(1, "every state needs >=1 citation (P1)"),
});

const StateMachineTransitionSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  event: z.string().min(1), // <=4 words (generic label budget) -- checked in pedagogy.ts
  citations: z.array(CitationInputSchema).min(1, "every transition needs >=1 citation (P1)"),
});

/**
 * "What modes exist -- what flips them?" -- kept as a PLAIN `z.object` (not
 * `.refine`d here) so it stays admissible as a `z.discriminatedUnion`
 * member; the state-id integrity checks (`initial` in `states`, every
 * transition's endpoints in `states`) run on `DeviceSpecSchema` below, once
 * the union already knows `kind === "state-machine"`. See this module's
 * header for why.
 */
const StateMachineObjectSchema = z.object({
  kind: z.literal("state-machine"),
  states: z
    .array(StateMachineStateSchema)
    .min(1, "a state machine needs at least 1 state")
    // ">5 states means the node is mis-leveled (Rule 0b corollary) -- reject" (visual-devices.md).
    .max(5, "a state machine holds at most 5 states"),
  transitions: z.array(StateMachineTransitionSchema),
  initial: z.string().min(1),
});
export type StateMachine = z.infer<typeof StateMachineObjectSchema>;

/**
 * The full 5-kind catalog `present_move.device` is optional -- omitted for
 * pure calibration moves (pedagogy-engine.md's Rule 1: a new region's first
 * move carries no device).
 */
export const DeviceSpecSchema = z
  .discriminatedUnion("kind", [
    ScenarioStripSchema,
    LawCardSchema,
    ExecutionTraceSchema,
    StateMachineObjectSchema,
    MemoryGraphSchema,
  ])
  .superRefine((device, ctx) => {
    // Cross-field state-machine checks only -- every other kind's shape is
    // fully pinned by its own object schema above (module header explains
    // why these can't live on StateMachineObjectSchema directly).
    if (device.kind !== "state-machine") return;
    // Duplicate ids would make `initial`/transition endpoints ambiguous --
    // "state-id integrity" (kb/plan.md step 2 scope) means every id names
    // exactly one state, not just "some" state.
    const seen = new Set<string>();
    device.states.forEach((state, index) => {
      if (seen.has(state.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["states", index, "id"],
          message: `duplicate state id "${state.id}"`,
        });
      }
      seen.add(state.id);
    });
    const knownIds = new Set(device.states.map((s) => s.id));
    if (!knownIds.has(device.initial)) {
      ctx.addIssue({
        code: "custom",
        path: ["initial"],
        message: `initial "${device.initial}" is not one of this machine's state ids`,
      });
    }
    device.transitions.forEach((transition, index) => {
      if (!knownIds.has(transition.from)) {
        ctx.addIssue({
          code: "custom",
          path: ["transitions", index, "from"],
          message: `transition references unknown state id "${transition.from}"`,
        });
      }
      if (!knownIds.has(transition.to)) {
        ctx.addIssue({
          code: "custom",
          path: ["transitions", index, "to"],
          message: `transition references unknown state id "${transition.to}"`,
        });
      }
    });
  });
export type DeviceSpec = z.infer<typeof DeviceSpecSchema>;
