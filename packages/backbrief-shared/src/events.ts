// Module: events -- Event payload types + zod schemas (human/system -> agent).
//
// Implements kb/spec/data-model.md#event-payloads-humansystem--agent. Wire
// shape is the same envelope-less `{type, refs, payload, clientKey}` POST
// /api/events parses; the server assigns `id`/`seq`/`ts`/`actor`
// (`human` for browser-originated events, `system` for watcher-generated
// ones like `head_changed`) after parsing.
// Key design decision: `mark_understood`/`contest`/`annotation`/etc. carry
// no actor field of their own -- P4 ("only the human advances
// understanding") is enforced by the SERVER at the auth chokepoint (the
// human token is required for `mark_understood`/`contest`, per
// api-contracts.md), not by the schema, because the schema has no way to
// know which token submitted it. Schema + auth middleware together close
// the gap; neither alone would.
// Step 3: a handful of event types are also agent-producible (`answer`,
// `open_finding`, `resolve_finding`, `kb_proposal`, `resolve_proposal`) --
// see `AgentPostableEventSchema` at the bottom of this file for the closed
// set `backbrief act` may submit through POST /api/actions.
import { z } from "zod";
import { CitationInputSchema } from "@brief/shared";
import { UlidSchema } from "@brief/shared";
// v2 (ADR-005): node_response/nodes_invalidated/move_response/mode_change
// are DEFINED in their own domain modules (overlay.ts/pedagogy.ts) -- see
// data-model.md's "v2 payload homes" note. This file only WIRES them into
// the closed EventSchema union, same as every other event.
import { NodeResponseEventSchema, NodesInvalidatedEventSchema } from "./overlay";
import { MoveResponseEventSchema, ModeChangeEventSchema } from "./pedagogy";
// v2 step 4 (ADR-005, kb/spec/pedagogy-engine.md#rupture): the one HUMAN
// event of the pause-for-change lifecycle -- same wiring pattern as the
// two imports above.
import { ChangeBreakResponseEventSchema } from "./rupture";
// Round-7 (ADR-007, kb/spec/interaction-model.md): the two human-authored
// events of the choice/talk protocol (`talk_advance`/`talk_exit` join
// `choice_made` here) -- same wiring pattern as the import above.
import { ChoiceMadeEventSchema } from "./choices";
import { TalkAdvanceEventSchema, TalkExitEventSchema } from "./talk";

const AnnotationEvent = z.object({
  type: z.literal("annotation"),
  payload: z.object({
    // Client-generated ULID; re-posting the same id updates the annotation
    // (last-wins in annotations.jsonl) -- data-model.md#event-payloads.
    annotationId: UlidSchema,
    // Step 2 widening: was CodeCitationInputSchema-only (step 1, cards
    // were code-only). algorithms.md#annotation-anchoring-and-relocation
    // is explicit that BOTH "Code-anchored annotations" and "KB-anchored
    // annotations (KbCitation)" exist and relocate differently -- a schema
    // gap this step's web scope ("annotate any selected code region OR KB
    // section") surfaced directly. validate/relocate.ts and store/
    // annotation-store.ts already branch on `citation.kind`, so widening
    // this one schema line is the only change needed to make both kinds
    // reachable end to end.
    citation: CitationInputSchema,
    text: z.string().min(1),
    kind: z.enum(["note", "concern", "disagree"]),
    // Step 2 addition (algorithms.md#annotation-anchoring-and-relocation's
    // triage section): "re-post the same annotationId... with
    // archived: true (dismiss) -- both ordinary annotation events, no
    // special mechanism." Not in data-model.md's original annotation
    // bullet -- added there in the same commit as this schema change.
    archived: z.boolean().optional(),
  }),
});

const ImpressionEvent = z.object({
  type: z.literal("impression"),
  payload: z.object({ targetPath: z.string().min(1), text: z.string().min(1) }),
});

const QuestionEvent = z.object({
  type: z.literal("question"),
  payload: z.object({
    text: z.string().min(1),
    citation: CitationInputSchema.optional(),
    // Threading, not a leaked client "activity" concept (defect 2026-07-13:
    // a pinned-composer follow-up and a brand-new LEFT-box question posted
    // the IDENTICAL envelope, so the client-side activity fold could not
    // tell them apart -- both minted a fresh activity). Mirrors the
    // PROTOCOL'S OWN existing precedent exactly: `answer{questionId, text}`
    // (below) already references the envelope id of the question it
    // answers; `inReplyTo` does the same thing for a `question` that
    // continues an existing activity instead of starting a new one. Server
    // stores/broadcasts it verbatim -- no server logic reads it (that's
    // web/src/lib/activities.ts's job, client-side).
    inReplyTo: UlidSchema.optional(),
  }),
});

const AnswerEvent = z.object({
  type: z.literal("answer"),
  payload: z.object({ questionId: UlidSchema, text: z.string().min(1) }),
});

const MarkUnderstoodEvent = z.object({
  type: z.literal("mark_understood"),
  payload: z.object({ targetPath: z.string().min(1) }),
});

const ContestEvent = z.object({
  type: z.literal("contest"),
  payload: z.object({ targetPath: z.string().min(1), reason: z.string().min(1) }),
});

const OpenFindingEvent = z.object({
  type: z.literal("open_finding"),
  payload: z.object({
    title: z.string().min(1),
    body: z.string().min(1),
    citations: z.array(CitationInputSchema),
  }),
});

const ResolveFindingEvent = z.object({
  type: z.literal("resolve_finding"),
  payload: z.object({ findingId: UlidSchema, resolution: z.string().min(1) }),
});

const KbProposalEvent = z.object({
  type: z.literal("kb_proposal"),
  payload: z.object({ kbPath: z.string().min(1), suggestion: z.string().min(1) }),
});

const ResolveProposalEvent = z.object({
  type: z.literal("resolve_proposal"),
  payload: z.object({ proposalId: UlidSchema, outcome: z.enum(["applied", "rejected"]) }),
});

const CheckpointResponseEvent = z.object({
  type: z.literal("checkpoint_response"),
  payload: z.object({ accepted: z.boolean() }),
});

const NavigationEvent = z.object({
  type: z.literal("navigation"),
  payload: z.object({
    path: z.string().min(1),
    kind: z.enum(["opened", "viewed-region"]),
    lines: z.tuple([z.number().int().positive(), z.number().int().positive()]).optional(),
  }),
});

const TourAckEvent = z.object({
  type: z.literal("tour_ack"),
  payload: z.object({ index: z.number().int().nonnegative() }),
});

const TourPauseEvent = z.object({
  type: z.literal("tour_pause"),
  payload: z.object({}),
});

const SessionEndEvent = z.object({
  type: z.literal("session_end"),
  payload: z.object({}),
});

const HeadChangedEvent = z.object({
  type: z.literal("head_changed"),
  payload: z.object({
    from: z.string().min(1),
    to: z.string().min(1),
    // Embedded so understood-decay is a pure fold over the log (P6):
    // rebuilding state never needs to shell out to git.
    changedPaths: z.array(z.string().min(1)),
  }),
});

const FocusChangedEvent = z.object({
  type: z.literal("focus_changed"),
  // `from`/`to` are Session["focus"] values; kept as z.unknown() here to
  // avoid a circular import with session.ts's FocusSchema for a payload
  // shape no step-1 code branches on (system-generated, step 3 consumes it).
  payload: z.object({ from: z.unknown(), to: z.unknown() }),
});

/** Fields common to every event envelope, merged onto each variant above. */
const EventEnvelopeFields = z.object({
  refs: z.array(CitationInputSchema).default([]),
  clientKey: UlidSchema.optional(),
});

export const EventSchema = z.discriminatedUnion("type", [
  AnnotationEvent.extend(EventEnvelopeFields.shape),
  ImpressionEvent.extend(EventEnvelopeFields.shape),
  QuestionEvent.extend(EventEnvelopeFields.shape),
  AnswerEvent.extend(EventEnvelopeFields.shape),
  MarkUnderstoodEvent.extend(EventEnvelopeFields.shape),
  ContestEvent.extend(EventEnvelopeFields.shape),
  OpenFindingEvent.extend(EventEnvelopeFields.shape),
  ResolveFindingEvent.extend(EventEnvelopeFields.shape),
  KbProposalEvent.extend(EventEnvelopeFields.shape),
  ResolveProposalEvent.extend(EventEnvelopeFields.shape),
  CheckpointResponseEvent.extend(EventEnvelopeFields.shape),
  NavigationEvent.extend(EventEnvelopeFields.shape),
  TourAckEvent.extend(EventEnvelopeFields.shape),
  TourPauseEvent.extend(EventEnvelopeFields.shape),
  SessionEndEvent.extend(EventEnvelopeFields.shape),
  HeadChangedEvent.extend(EventEnvelopeFields.shape),
  FocusChangedEvent.extend(EventEnvelopeFields.shape),
  NodeResponseEventSchema,
  NodesInvalidatedEventSchema,
  MoveResponseEventSchema,
  ModeChangeEventSchema,
  ChangeBreakResponseEventSchema,
  ChoiceMadeEventSchema,
  TalkAdvanceEventSchema,
  TalkExitEventSchema,
]);
export type Event = z.infer<typeof EventSchema>;
export type EventType = Event["type"];

/** Events only the server itself may produce (watchers, not human input).
 *  `nodes_invalidated` joins this v1 set in v2 -- the staleness pass
 *  (server/watch, server/api/session) is its only producer, mirroring
 *  `head_changed`'s own watcher-only production (comprehension-map.md).
 *  `mode_change` is deliberately NOT here -- overlay.ts's/pedagogy.ts's
 *  header explains why: a human posting it directly is the PRIMARY path. */
export const SYSTEM_EVENT_TYPES: ReadonlySet<EventType> = new Set([
  "head_changed",
  "focus_changed",
  "nodes_invalidated",
]);

/**
 * `answer` alone, standalone-parseable -- kb/spec/api-contracts.md#cli:
 * "act also accepts answer {questionId, text}... routed through POST
 * /api/actions so attribution stays token-derived." `ActionSchema`
 * (./actions.ts) only covers agent-authored ACTIONS; `answer` is defined
 * as an Event (data-model.md, valid from either actor) but must ALSO parse
 * at the actions endpoint when the agent posts one via `backbrief act`.
 * Exporting it standalone (rather than folding `answer` into ActionSchema's
 * union) keeps the two schemas matching their spec sections exactly;
 * server/src/api/actions.ts tries this as a fallback after ActionSchema fails.
 */
export const AnswerEventSchema = AnswerEvent.extend(EventEnvelopeFields.shape);

// Step 3 widening: data-model.md marks `open_finding`/`resolve_finding` as
// "(either actor)" and `kb_proposal`/`resolve_proposal` as "(agent)" --
// unlike `answer` (step 1/2), NOTHING previously let the agent reach these
// through `backbrief act` (only `answer` had a standalone export). An agent
// that finds a real issue mid-session, or wants to propose a KB fix, needs
// this path -- so each gets the same standalone-schema treatment as
// `answer`, tried as a fallback by actions.ts's AGENT_POSTABLE_EVENT_SCHEMA.
export const OpenFindingEventSchema = OpenFindingEvent.extend(EventEnvelopeFields.shape);
export const ResolveFindingEventSchema = ResolveFindingEvent.extend(EventEnvelopeFields.shape);
export const KbProposalEventSchema = KbProposalEvent.extend(EventEnvelopeFields.shape);
export const ResolveProposalEventSchema = ResolveProposalEvent.extend(EventEnvelopeFields.shape);

/**
 * The complete set of Event types `backbrief act` may submit (routed
 * through POST /api/actions so attribution stays token-derived, per
 * api-contracts.md#cli) -- tried as a fallback, in this fixed order, only
 * after ActionSchema itself fails to parse the body (server/src/api/
 * actions.ts). Deliberately NOT the full `EventSchema` union: `annotation`,
 * `mark_understood`, `contest`, `navigation`, `tour_ack`, etc. stay
 * reachable only via POST /api/events (the human/browser path, or P4's
 * auth gate) -- widening this union means widening what the agent can do
 * without a hash, so every addition here is a deliberate protocol decision,
 * not a default.
 */
export const AgentPostableEventSchema = z.discriminatedUnion("type", [
  AnswerEventSchema,
  OpenFindingEventSchema,
  ResolveFindingEventSchema,
  KbProposalEventSchema,
  ResolveProposalEventSchema,
]);
