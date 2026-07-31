// Module: envelope -- the shared PrimitiveSpec envelope every concrete
// primitive kind carries (kb/primitives/spec.md): schemaVersion, kind,
// trust, title. Lives in the "." entry (package.json exports map) so any
// consumer can sniff a raw spec's `kind` and its trust/version vocabulary
// without loading a single heavy renderer dependency (PR6) -- only
// ./diagram and ./filmstrip import a zod schema that folds these fields
// into its own strict object.
//
// Uses "zod/mini" rather than classic "zod" (step 2, bundle-budget
// finding): this module is reachable from EVERY entry point, including
// "./matrix" -- a DOM-only consumer's whole bundle-size cost for
// validation. Classic zod's chained-method API pulls in enough of its
// runtime that a first measurement (forebrief's web bundle, linking only
// "./matrix") blew the 50KB budget by ~7x; zod/mini shares the exact same
// core issue/parsing representation (`core.$ZodIssue` underlies both
// classic's `ZodIssue` and mini's issues -- schema-error.ts's
// `PrimitiveSchemaError` works unchanged on issues from either), but is
// built for tree-shaking: no convenience methods like `.min()`, only
// composable `.check(z.minLength(1))` calls a bundler can drop when
// unused. `./diagram` and `./filmstrip` (never reachable from a DOM-only
// consumer, per PR6) stay on classic zod, unaffected -- see matrix/spec.ts
// for the same conversion applied to a body schema with a `superRefine`.
import { z } from "zod/mini";

/**
 * The five primitives in @brief/primitives's scope (kb/primitives/
 * scope.md). All five now have concrete schemas: "diagram", "filmstrip",
 * and "matrix" as of slice-one step 2, "chart" and "claim" as of step 3
 * (kb/primitives/implementation-slices.md) -- the enum was written out in
 * full from step 1 because kb/primitives/spec.md's envelope already named
 * all five, so extending it here was never needed.
 */
export const PrimitiveKindSchema = z.enum([
  "diagram",
  "filmstrip",
  "chart",
  "matrix",
  "claim",
]);
export type PrimitiveKind = z.infer<typeof PrimitiveKindSchema>;

/** Whole-visual trust, always at its weakest claim (ADR-011, PR3). */
export const TrustSchema = z.enum(["grounded", "conjecture"]);
export type Trust = z.infer<typeof TrustSchema>;

/**
 * Reusable envelope field definitions -- spread into each concrete kind's
 * `z.strictObject({...envelopeFields, kind: z.literal(...), ...})` (see
 * ./diagram/spec.ts, ./filmstrip/spec.ts).
 *
 * @invariant PR7 -- `schemaVersion`/`title` reject empty strings so a
 * malformed spec fails at THIS field, naming its own path, rather than
 * limping through as an empty-titled render.
 *
 * Not exposed as a standalone parseable zod object: zod's `.strict()` must
 * reject unknown keys on the FINAL merged shape, and spreading plain field
 * definitions into each concrete `z.strictObject` keeps that guarantee
 * legible at the point it is promised, instead of relying on `.extend()`
 * composition across a shared base.
 */
export const envelopeFields = {
  schemaVersion: z.string().check(z.minLength(1)),
  trust: TrustSchema,
  title: z.optional(z.string().check(z.minLength(1))),
} as const;

/** TS shape mirroring `envelopeFields`, for documentation/JSDoc references
 *  -- the zod-inferred type on each concrete schema is the source of truth. */
export interface PrimitiveEnvelopeShape {
  schemaVersion: string;
  kind: PrimitiveKind;
  trust: Trust;
  title?: string;
}

/**
 * The minimal shape needed to decide WHICH primitive entry point to load,
 * without validating (or importing) anything kind-specific. A consumer
 * dispatching between `./diagram`, `./filmstrip`, etc. calls this first so
 * the decision of which heavy dependency to load happens outside every
 * entry point (PR6 would be unenforceable if the sniff itself needed a
 * specific renderer's schema).
 */
const KindSniffSchema = z.looseObject({ kind: PrimitiveKindSchema });

/**
 * @param raw an untrusted parsed-JSON value, before any kind-specific
 *   validation
 * @returns the spec's declared `kind`, or `null` if `raw` isn't an object
 *   with a recognized `kind` field
 * @invariant PR6 -- performs no kind-specific parsing, so it never forces
 *   a Graphviz/Vega import as a side effect of merely routing.
 */
export function sniffPrimitiveKind(raw: unknown): PrimitiveKind | null {
  const result = KindSniffSchema.safeParse(raw);
  return result.success ? result.data.kind : null;
}
