// Module: records/schemas -- zod `.strict()` schemas for every `act`
// record payload (kb/spec/data-model.md#record-payloads).
//
// Wire-shape decision (not fully pinned by cli-contract.md): the JSON body
// `act` posts is one record's fields plus a top-level discriminant `kind`
// (the same string that becomes the envelope's `type`) -- e.g.
// `{kind:"decision", card, chosen, ...}`. This mirrors how CardSubmission's
// own `kind` field already works and keeps `act`'s input a single flat
// object with no extra wrapper.
// @invariant P8: `mode:"provisional"` requires `applied_state` -- enforced
//   here, schema-level, so a provisional decision without it never reaches
//   the log (E_SCHEMA).
// @invariant these are INPUT schemas only: `late` (reconciliation) and
//   `sessionId` (every kind) are server-stamped, never accepted from a
//   submission -- see records/store.ts.
import { z } from "zod";
import { CitationInputSchema } from "@brief/shared";
import { OptionKeySchema } from "../types/round";

const SourceChannelSchema = z.enum(["ui", "chat", "file"]);

const AppliedStateSchema = z
  .object({ commit: z.string().min(1), plan_step: z.string().min(1) })
  .strict();

export const DecisionInputSchema = z
  .object({
    kind: z.literal("decision"),
    // ADR-009 (dogfooding gap 4, 2026-07-28): a decision reached in
    // conversation about something nobody carded had no record type -- it
    // landed as `feedback`, which is not what it is, and P4's promise that
    // every decision has a record had a hole exactly where decisions are
    // taken most casually. `card` is therefore optional, and a cardless
    // decision carries its own question text instead.
    card: z.string().min(1).optional(),
    /** The question, for a decision with no card. Verbatim, like a rationale:
     *  it is the only statement of what was being decided. */
    prompt: z.string().min(1).optional(),
    chosen: OptionKeySchema,
    mode: z.enum(["accepted-default", "override", "provisional"]),
    rationale: z.string().min(1).optional(),
    applied_state: AppliedStateSchema.optional(),
    source_channel: SourceChannelSchema,
    dwell_ms: z.number().nonnegative().optional(),
    // kb/spec/data-model.md's Constraints paragraph (T9): carried only when
    // the decision predates its logging (a chat/file decision appended
    // late) -- its presence is what `digest` flags "logged retroactively".
    // Gap fixed in the same commit: the enumerated `decision` payload block
    // hadn't listed this field even though the Constraints section requires it.
    decided_at: z.string().datetime().optional(),
  })
  .strict()
  .superRefine((d, ctx) => {
    // Exactly one of card / prompt identifies what was decided. Both would
    // make the card's own prompt and a free-text one disagree with no rule
    // for which wins; neither leaves a decision that names nothing.
    if (d.card === undefined && d.prompt === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["prompt"],
        message: "a decision with no card must carry its own prompt (ADR-009)",
      });
    }
    if (d.card !== undefined && d.prompt !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["prompt"],
        message: "a carded decision takes its question from the card; drop prompt (ADR-009)",
      });
    }
    if (d.mode === "provisional" && d.applied_state === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["applied_state"],
        message: "mode:provisional requires applied_state {commit, plan_step} (P8)",
      });
    }
  });
export type DecisionInput = z.infer<typeof DecisionInputSchema>;

// Spec completion (user feedback seq 21): the original three modes were
// designed for chat-history reconciliation of a HUMAN OVERRIDE -- they
// don't fit confirming/overriding an AGENT-APPLIED provisional from the
// browser's own reconciliation UI. Appended, never replaced ("confirmed"/
// "overridden" are new; the original three are unchanged and still accepted
// -- shipped log lines use them, kb/spec/data-model.md).
//   confirmed  -- human confirms the applied default; final = the applied option key
//   overridden -- human picks another option; final = the new key
// `rationale` relaxed from mandatory to optional (was `z.string().min(1)`
// unconditionally): "confirmed" needs none (nothing changed), and
// "overridden" gets the SAME one-nudge-then-bare treatment as a decision
// override (kb/properties/edge-cases.md#T3) -- unreachable if this stayed
// required. The three original modes still accept a rationale exactly as
// before; nothing that always sent one is affected.
export const ReconciliationInputSchema = z
  .object({
    kind: z.literal("reconciliation"),
    card: z.string().min(1),
    final: OptionKeySchema,
    mode: z.enum([
      "override-confirmed",
      "override-withdrawn",
      "superseded",
      "confirmed",
      "overridden",
    ]),
    rationale: z.string().min(1).optional(),
    source_channel: SourceChannelSchema,
  })
  .strict();
export type ReconciliationInput = z.infer<typeof ReconciliationInputSchema>;

export const AskWhyInputSchema = z
  .object({ kind: z.literal("ask_why"), card: z.string().min(1), text: z.string().min(1) })
  .strict();
export type AskWhyInput = z.infer<typeof AskWhyInputSchema>;

export const AskContextInputSchema = z
  .object({ kind: z.literal("ask_context"), card: z.string().min(1), text: z.string().min(1) })
  .strict();
export type AskContextInput = z.infer<typeof AskContextInputSchema>;

export const AnswerInputSchema = z
  .object({
    kind: z.literal("answer"),
    card: z.string().min(1),
    ref_seq: z.number().int().nonnegative(),
    text: z.string().min(1),
    citations: z.array(CitationInputSchema).optional(),
  })
  .strict();
export type AnswerInput = z.infer<typeof AnswerInputSchema>;

export const FeedbackInputSchema = z
  .object({
    kind: z.literal("feedback"),
    card: z.string().min(1).optional(),
    text: z.string().min(1),
  })
  .strict();
export type FeedbackInput = z.infer<typeof FeedbackInputSchema>;

// Missing act, found by the author while deciding a live round (2026-07-27):
// the four existing moves all presuppose that one of the offered options is
// the answer. Accepting, overriding, asking why and asking for context leave
// no way to say "none of these, study this instead". A counter-proposal is
// that fifth move: it REJECTS the option set and names an alternative the
// agent is expected to study, and it deliberately does NOT decide the card,
// which stays open until a revised card offers the alternative (or the human
// decides after all).
// @invariant `text` is stored verbatim, like a rationale: the fold gate (P7)
//   checks the human's own words, and an agent paraphrase of a
//   counter-proposal is exactly the loss that gate exists to prevent.
export const CounterProposalInputSchema = z
  .object({
    kind: z.literal("counter_proposal"),
    card: z.string().min(1),
    /** The alternative, in the human's words. */
    text: z.string().min(1),
    /** Why the offered options do not fit. Optional: the alternative usually says it. */
    rationale: z.string().min(1).optional(),
    source_channel: SourceChannelSchema,
  })
  .strict();
export type CounterProposalInput = z.infer<typeof CounterProposalInputSchema>;

export const SitDownInputSchema = z
  .object({ kind: z.literal("sit_down"), open: z.boolean() })
  .strict();
export type SitDownInput = z.infer<typeof SitDownInputSchema>;

export const FoldInputSchema = z
  .object({
    kind: z.literal("fold"),
    round_id: z.string().min(1).optional(),
    cards: z.array(z.string().min(1)).optional(),
    commit: z.string().min(1),
    files: z.array(z.string().min(1)).min(1),
  })
  .strict();
export type FoldInput = z.infer<typeof FoldInputSchema>;

export const RecordSubmissionSchema = z.discriminatedUnion("kind", [
  DecisionInputSchema,
  ReconciliationInputSchema,
  AskWhyInputSchema,
  AskContextInputSchema,
  AnswerInputSchema,
  CounterProposalInputSchema,
  FeedbackInputSchema,
  SitDownInputSchema,
  FoldInputSchema,
]);
export type RecordSubmission = z.infer<typeof RecordSubmissionSchema>;

/** Envelope-owned fields (kb/spec/data-model.md's "Consequences" paragraph)
 *  a record submission must never carry -- present means a mutation
 *  attempt, not an ordinary schema error (P5, E_SEQ_CONFLICT). */
export const FORBIDDEN_ENVELOPE_KEYS = ["seq", "id", "clientKey", "actor"] as const;
