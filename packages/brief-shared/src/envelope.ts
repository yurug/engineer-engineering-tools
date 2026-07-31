// Module: envelope -- the canonical, stored/broadcast Envelope shape.
//
// Implements kb/spec/data-model.md#envelope. Deliberately typed loosely on
// `type`/`payload` (matching the spec's own `payload: object // type-
// specific` comment) -- the PRECISE per-action/event payload shapes live in
// ./actions.ts and ./events.ts as the zod schemas used to *parse* an
// incoming action/event body. Once parsed, minted, and stored, an Envelope
// is addressed by `type` (a runtime switch) or by the generic citation
// walker (./citation-walk.ts), never by casting `payload` to a concrete
// interface -- so no second, shadow copy of every payload shape is needed
// here. This mirrors the spec precisely rather than under- or over-typing it.
import { z } from "zod";
import { CitationSchema, type Citation } from "./citation";

export type Actor = "agent" | "human" | "system";

/** Crockford base32, 26 chars -- the ULID shape (config-and-formats.md#ids). */
export const UlidSchema = z
  .string()
  .regex(/^[0-9A-HJKMNP-TV-Z]{26}$/i, "must be a ULID");

/**
 * The unit every action and event becomes once the server has assigned it
 * an id/seq/ts/actor and minted its citations. Persisted verbatim to the
 * per-session JSONL log (P6: immutable once appended) and broadcast
 * verbatim over WS/SSE.
 */
export interface Envelope {
  id: string;
  /** Strictly increasing per session, no gaps (P6) -- the only ordering clients may rely on. */
  seq: number;
  ts: string;
  actor: Actor;
  type: string;
  /** Topical citations, already minted -- see kb/spec/data-model.md#citation-locations. */
  refs: Citation[];
  /** Producer-generated ULID; server dedupes retried submissions on it (P2). */
  clientKey?: string;
  payload: object;
}

/**
 * Defensive parse for an Envelope read back off disk (JSONL) or received
 * over the wire -- guards against hand-edited or corrupted persisted state
 * without needing per-payload-type precision (see module header).
 */
export const EnvelopeSchema = z.object({
  id: UlidSchema,
  seq: z.number().int().nonnegative(),
  ts: z.string().min(1),
  actor: z.enum(["agent", "human", "system"]),
  type: z.string().min(1),
  refs: z.array(CitationSchema),
  clientKey: UlidSchema.optional(),
  // Any JSON object -- see module header for why payload precision lives
  // in the per-type Action/Event schemas, not here.
  payload: z.record(z.string(), z.unknown()),
});
