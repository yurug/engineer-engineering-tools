// Module: overlay -- OverlayEntry shape plus the `node_response`/
// `nodes_invalidated` event schemas.
//
// Implements kb/spec/comprehension-map.md's Overlay section (shapes only --
// the fold that BUILDS an overlay from the event log lives in
// ./overlay-fold.ts, split out to keep this file, and that one, under
// code-style.md's 200-line budget). kb/properties/functional.md#P11 is the
// authority contract these shapes exist to carry: `grasped`/`demonstrated`
// only from a human-token event, `invalidated` only system-produced.
// ADOPTED CLARIFICATION (spec gap, flagged in the step-1 report -- see
// kb/spec/comprehension-map.md's same-commit note on `node_response`):
// pedagogy-engine.md describes ONE `node_response{response:"confirm"}`
// landing on TWO different outcomes -- plain "grasped" (self-report) from
// the map's own confirm control, or "demonstrated" (prediction evidence)
// from the UI's one-click "that's what I said" after a verdict move -- but
// comprehension-map.md's `node_response` payload shape carries no field
// that could distinguish the two calls, and nothing else in the protocol
// can (node_response has no `moveId` to correlate against a prior
// move_response). Resolved by adding an OPTIONAL `evidenceKind` hint the
// UI sets only for the one-click path; every other caller omits it and
// gets the base "confirm -> grasped" behavior comprehension-map.md
// describes. This reuses the EXISTING EvidenceKind vocabulary the Overlay
// type already declares, rather than inventing a new mechanism.
import { z } from "zod";
import { UlidSchema } from "@brief/shared";
import { CitationInputSchema } from "@brief/shared";

export const MasteryStateSchema = z.enum([
  "unseen",
  "introduced",
  "grasped",
  "demonstrated",
  "shaky",
  "contested",
  "invalidated",
]);
export type MasteryState = z.infer<typeof MasteryStateSchema>;

export const EvidenceKindSchema = z.enum([
  "self-report",
  "prediction",
  "self-explanation",
  "transfer",
  "user-override",
  "contest",
  "staleness",
  "refinement",
]);
export type EvidenceKind = z.infer<typeof EvidenceKindSchema>;

export interface OverlayEvidence {
  ts: string;
  kind: EvidenceKind;
  moveId?: string;
  verbatim?: string;
}

export interface OverlayEntry {
  nodeId: string;
  state: MasteryState;
  refinedAnswer?: string;
  /** Append-only (P6 spirit) -- ./overlay-fold.ts's fold never removes a prior entry, only pushes. */
  evidence: OverlayEvidence[];
  updatedAt: string;
}

const NodeResponseEvent = z.object({
  type: z.literal("node_response"),
  payload: z.object({
    nodeId: z.string().min(1),
    response: z.enum(["confirm", "refine", "contest", "override"]),
    refinedAnswer: z.string().min(1).optional(),
    overrideState: MasteryStateSchema.optional(),
    reason: z.string().min(1).optional(),
    // See module header's ADOPTED CLARIFICATION -- UI-only hint, absent by default.
    evidenceKind: EvidenceKindSchema.optional(),
  }),
});

/**
 * System-only (like `head_changed`/`focus_changed`) -- the staleness pass
 * (server/watch, server/api/session) computes WHICH node ids broke and
 * appends this; ./overlay-fold.ts's fold just applies it. Never accepted
 * from `POST /api/events` (api/events.ts's `SYSTEM_EVENT_TYPES` gate,
 * extended in the same commit as this module).
 */
const NodesInvalidatedEvent = z.object({
  type: z.literal("nodes_invalidated"),
  payload: z.object({
    nodeIds: z.array(z.string().min(1)).min(1),
    cause: z.enum(["head_changed", "revalidate"]),
  }),
});

const EventEnvelopeFields = z.object({
  refs: z.array(CitationInputSchema).default([]),
  clientKey: UlidSchema.optional(),
});
/** Wired into `EventSchema`'s union by ./events.ts. */
export const NodeResponseEventSchema = NodeResponseEvent.extend(EventEnvelopeFields.shape);
export const NodesInvalidatedEventSchema = NodesInvalidatedEvent.extend(EventEnvelopeFields.shape);
export type NodeResponsePayload = z.infer<typeof NodeResponseEventSchema>["payload"];
export type NodesInvalidatedPayload = z.infer<typeof NodesInvalidatedEventSchema>["payload"];
