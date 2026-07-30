// Module: actions -- Action payload types + zod schemas (agent -> app).
//
// Implements kb/spec/data-model.md#action-payloads-agent--app. Each schema
// is the WIRE shape POST /api/actions parses (kb/spec/api-contracts.md):
// `{type, refs, payload, clientKey}`, envelope-less -- the server adds
// `id`/`seq`/`ts`/`actor` after parsing (see ./envelope.ts). Citations
// embedded in payloads (e.g. `show_excerpt.citation`) use
// CitationInputSchema, the same optional-rev/hash shape as top-level
// `refs`, because they go through the identical mint-then-validate pipeline
// (data-model.md#citation-locations: "citations appear in refs AND in the
// citation-typed payload fields... Validation walks ALL of them").
// Key design decision: `ask_question.kbAnchor` is a REQUIRED field, not
// optional -- this is P9 ("challenge questions cite their anchor") enforced
// structurally: an anchor-less question fails zod parsing with
// E_VALIDATION before any business logic runs, so P9 cannot be
// accidentally bypassed by a code path that forgets to check it.
import { z } from "zod";
import { CitationInputSchema, CodeCitationInputSchema, KbCitationSchema } from "@brief/shared";
import { DiagramSpecSchema } from "./diagram";
import { FocusSchema } from "./session";
import { UlidSchema } from "@brief/shared";
// v2 (ADR-005): map_upsert/present_move are DEFINED in their own domain
// modules (comprehension-map.ts/pedagogy.ts), not inline here -- see
// data-model.md's "v2 payload homes" note. This file only WIRES them into
// the closed ActionSchema union, same as every other action.
import { MapUpsertActionSchema } from "./comprehension-map";
import { PresentMoveActionSchema } from "./pedagogy";
// v2 step 4 (ADR-005, kb/spec/pedagogy-engine.md#rupture): the three AGENT
// actions of the pause-for-change lifecycle -- same "defined in its own
// domain module, wired in here" pattern as the two imports above.
import {
  ProposeChangeBreakActionSchema,
  PauseForChangeActionSchema,
  ResumeSessionActionSchema,
} from "./rupture";
// Round-7 (ADR-007, kb/spec/interaction-model.md): the choice protocol
// (offer_choices) and the talk lifecycle's three agent-authored actions --
// same "defined in its own domain module, wired in here" pattern as the
// imports above.
import { OfferChoicesActionSchema } from "./choices";
import { TalkStartActionSchema, TalkSlideActionSchema, TalkEndActionSchema } from "./talk";

/** A Card is agent-authored markdown plus its own citations (glossary.md#card). */
const CardSchema = z.object({
  markdown: z.string().min(1),
  title: z.string().optional(),
  refs: z.array(CitationInputSchema).default([]),
});

const PostCardAction = z.object({
  type: z.literal("post_card"),
  payload: z.object({ markdown: z.string().min(1), title: z.string().optional() }),
});

const ShowExcerptAction = z.object({
  type: z.literal("show_excerpt"),
  payload: z.object({ citation: CodeCitationInputSchema, note: z.string().optional() }),
});

const HighlightRegionAction = z.object({
  type: z.literal("highlight_region"),
  payload: z.object({ citation: CodeCitationInputSchema, style: z.enum(["focus", "warn"]) }),
});

const ShowDiagramAction = z.object({
  type: z.literal("show_diagram"),
  payload: z.object({ spec: DiagramSpecSchema, caption: z.string().optional() }),
});

const AskQuestionAction = z.object({
  type: z.literal("ask_question"),
  payload: z.object({ text: z.string().min(1), kbAnchor: KbCitationSchema }),
});

const TourStartAction = z.object({
  type: z.literal("tour_start"),
  payload: z.object({
    title: z.string().min(1),
    question: z.string().min(1),
    viewpoint: z.string().optional(),
    stepCount: z.number().int().positive(),
  }),
});

const TourStepAction = z.object({
  type: z.literal("tour_step"),
  payload: z.object({ index: z.number().int().nonnegative(), card: CardSchema }),
});

const TourEndAction = z.object({
  type: z.literal("tour_end"),
  payload: z.object({ summary: z.string().optional() }),
});

const ProposeCheckpointAction = z.object({
  type: z.literal("propose_checkpoint"),
  payload: z.object({ reason: z.string().min(1), focus: FocusSchema }),
});

/** Fields common to every action envelope, merged onto each variant above. */
const ActionEnvelopeFields = z.object({
  refs: z.array(CitationInputSchema).default([]),
  clientKey: UlidSchema.optional(),
});

export const ActionSchema = z.discriminatedUnion("type", [
  PostCardAction.extend(ActionEnvelopeFields.shape),
  ShowExcerptAction.extend(ActionEnvelopeFields.shape),
  HighlightRegionAction.extend(ActionEnvelopeFields.shape),
  ShowDiagramAction.extend(ActionEnvelopeFields.shape),
  AskQuestionAction.extend(ActionEnvelopeFields.shape),
  TourStartAction.extend(ActionEnvelopeFields.shape),
  TourStepAction.extend(ActionEnvelopeFields.shape),
  TourEndAction.extend(ActionEnvelopeFields.shape),
  ProposeCheckpointAction.extend(ActionEnvelopeFields.shape),
  MapUpsertActionSchema,
  PresentMoveActionSchema,
  ProposeChangeBreakActionSchema,
  PauseForChangeActionSchema,
  ResumeSessionActionSchema,
  OfferChoicesActionSchema,
  TalkStartActionSchema,
  TalkSlideActionSchema,
  TalkEndActionSchema,
]);
export type Action = z.infer<typeof ActionSchema>;
export type ActionType = Action["type"];
