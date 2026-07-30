// Module: version -- the schemaVersion this build of @brief/primitives
// implements, and the skew check every renderer runs before rendering
// (ADR-012). Lives in the "." entry (not per-primitive): ADR-012's "what
// this does not cover" section decides the version is per-PACKAGE, not
// per-kind, "split only if primitives evolve at genuinely different
// rates" -- not yet observed, so one constant serves diagram and filmstrip
// alike.
//
// DISCIPLINE (ADR-012's definition of done): bump this string in the SAME
// commit as any breaking change to DiagramSpecSchema, FilmstripSpecSchema,
// or any later kind's schema. An unbumped breaking change makes the skew
// banner lie, which ADR-012 names as worse than no banner at all.
//
// Bumped 0.1.0 -> 0.2.0 in the SAME commit that adds MatrixSpecSchema
// (implementation-slices.md Step 2): a spec now declaring `kind:"matrix"`
// is new capability this package didn't validate before, so a consumer
// still running the 0.1.0 build (no ./matrix entry at all) must be able to
// tell it is behind rather than fail with an opaque module-resolution
// error -- the version number is the signal that survives even when the
// stale copy lacks the entry point the mismatch is ultimately about.
//
// Bumped 0.2.0 -> 0.3.0 in the SAME commit that adds ChartSpecSchema and
// ClaimSpecSchema (implementation-slices.md Step 3): same rationale, twice
// over -- a consumer on the 0.2.0 build has neither "./chart" nor
// "./claim" at all.
export const PRIMITIVES_SCHEMA_VERSION = "0.3.0";

/**
 * Step 2's real refresh mechanics (implementation-slices.md's "biggest
 * unknown": whether the cross-repo linked-copy workflow is tolerable in
 * practice). Replaces the step-1 placeholder ("npm run refresh-primitives",
 * a script name no package.json actually defined) with the literal,
 * runnable command: `tools/refresh-primitives.sh`, run from a sibling
 * consumer repo's root (mirrors the CI convention already used for
 * `@brief/core`/`@brief/shared`, kb/architecture/overview.md in the
 * forebrief repo: sibling checkouts under the same parent directory).
 * The script rebuilds this package from source, then reinstalls the
 * consumer's copy so npm's file:-dependency COPY (not symlink) is
 * refreshed. Must be updated in the same commit as any change to the
 * script's location or invocation.
 */
export const PRIMITIVES_REFRESH_COMMAND = "../backbrief/tools/refresh-primitives.sh";

/** The shape a renderer needs to decide skew -- never thrown, because
 *  skew renders a banner (PR5), not a validation failure. */
export interface SchemaVersionCheck {
  ok: boolean;
  implementedVersion: string;
  specVersion: string;
  /** Only meaningful when `!ok` -- see `PRIMITIVES_REFRESH_COMMAND`'s note. */
  refreshCommand: string;
}

/**
 * @invariant PR5 -- callers render the skew banner (never throw) whenever
 *   `!result.ok`.
 */
export function checkSchemaVersion(specVersion: string): SchemaVersionCheck {
  return {
    ok: specVersion === PRIMITIVES_SCHEMA_VERSION,
    implementedVersion: PRIMITIVES_SCHEMA_VERSION,
    specVersion,
    refreshCommand: PRIMITIVES_REFRESH_COMMAND,
  };
}
