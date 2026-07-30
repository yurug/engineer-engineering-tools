// Module: errors -- the closed AppError/Result vocabulary shared by every package.
//
// This module is the single definition of backbrief's error taxonomy
// (kb/spec/error-taxonomy.md). It implements kb/conventions/error-handling.md:
// pure code returns Result<T> and never throws; I/O boundaries (server route
// handlers, CLI commands) throw or catch AppError; every failure carries one
// of the closed ErrorCode values. Inventing a new failure mode means adding
// a code to the taxonomy doc AND this union in the same commit (the
// same-commit rule in this repo's CLAUDE.md).
// Key design decision: AppError extends the built-in Error (not a plain
// tagged object) so stack traces survive across the server's HTTP boundary
// for logging, while `instanceof` still works after compilation to
// CommonJS (see the prototype fixup below -- a known TS/ES2015 class
// extension caveat).

/**
 * The closed set of error codes backbrief may ever surface. Mirrors
 * kb/spec/error-taxonomy.md's table exactly -- any code not in this union
 * is, by the taxonomy's own rule, a bug (`E_INTERNAL`).
 */
export type ErrorCode =
  | "E_AUTH"
  | "E_ALREADY_RUNNING"
  | "E_NO_REPO"
  | "E_SESSION_ENDED"
  | "E_VALIDATION"
  | "E_UNGROUNDED_DIAGRAM"
  | "E_NOT_FOUND"
  | "E_TOO_LARGE"
  | "E_BINARY"
  | "E_BAD_REF"
  | "E_CONFIG"
  | "E_PORT_IN_USE"
  | "E_KB_MISSING"
  | "E_OVER_BUDGET"
  | "E_MAP_VALIDATION"
  // v2 step 4 (ADR-005, kb/spec/pedagogy-engine.md#rupture): `present_move`
  // rejected while `Session.status === "paused-for-change"`.
  | "E_SESSION_PAUSED"
  | "E_INTERNAL";

/**
 * The one error type that crosses every module boundary in backbrief --
 * and, since ADR-001, in @brief/core and any other consumer built on
 * it (forebrief).
 *
 * WHY generic over `Code` (kb/external/backbrief-internals.md, extraction
 * gap found at plan step 1): `@brief/core`'s modules (fsguard, event-
 * store, discovery...) throw AppError with backbrief's own codes today,
 * but a second consumer (forebrief) needs its OWN closed error-code union
 * (`E_SCHEMA`, `E_FS_BOUNDARY`, ... -- forebrief's error-taxonomy.md) that
 * shares only some codes with backbrief's. A single shared `AppError`
 * class is required so `instanceof AppError` keeps working at the ONE
 * HTTP chokepoint (`toErrorResponse`) regardless of which consumer's code
 * a given error carries -- two separate classes would silently split that
 * check. The default type argument (`ErrorCode`, this file's closed
 * union) means every EXISTING backbrief call site (`new AppError("E_AUTH",
 * ...)`) keeps exactly the same compile-time checking as before; a new
 * consumer instantiates `new AppError<OtherUnion>(...)` explicitly.
 */
export class AppError<Code extends string = ErrorCode> extends Error {
  constructor(
    readonly code: Code,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
    // WHY: TS classes extending a built-in like Error lose their prototype
    // chain when compiled to CommonJS/ES2015 targets, breaking
    // `instanceof AppError` at the server's catch-and-map-to-HTTP
    // chokepoint. Restoring it explicitly is the documented workaround.
    // `new.target.prototype` (not the fixed `AppError.prototype`) so the
    // fixup is correct regardless of which generic instantiation created
    // the instance.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Result-style return for pure/`shared` code -- see conv-error-handling.md. */
export type Result<T> = { ok: true; value: T } | { ok: false; error: AppError };

/** @returns a successful Result wrapping `value`. */
export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

/** @returns a failed Result wrapping `error`. */
export function err<T = never>(error: AppError): Result<T> {
  return { ok: false, error };
}
