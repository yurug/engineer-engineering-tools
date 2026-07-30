// Module: api/middleware -- auth extraction + the one error-mapping
// chokepoint for every HTTP route.
//
// Extracted from @backbrief/server (ADR-001). "Server I/O modules may throw
// AppError; route handlers catch at one middleware chokepoint that maps
// code -> HTTP status -> {error} body. Nothing else catches broadly." Every
// route requires `Authorization: Bearer <token>` (or `?token=` for the
// browser bootstrap URL), and the token is the ONLY actor-attribution
// mechanism -- this middleware is where a request's token becomes
// `c.get("actor")`.
// WHY `toErrorResponse` takes a status map (kb/external/backbrief-
// internals.md gap found at plan step 1): backbrief's original version had
// a `Record<ErrorCode, Status>` HARDCODED to its own closed error-code
// union (17 backbrief-specific codes) -- a second consumer (forebrief) has
// its own, disjoint-except-for-a-few-codes union. The chokepoint MECHANISM
// (AppError -> status -> {error} body, unmapped code -> 500) is what moves;
// each consumer supplies its own code -> status table.
import type { Context, Next } from "hono";
import type { ClientErrorStatusCode, ServerErrorStatusCode } from "hono/utils/http-status";
import { AppError } from "@brief/shared";
import { identifyActor, type Tokens, type TokenActor } from "../auth";

declare module "hono" {
  interface ContextVariableMap {
    actor: TokenActor;
  }
}

export type HttpStatus = ClientErrorStatusCode | ServerErrorStatusCode;

/** Whatever "mark this actor as recently seen" means to the caller (e.g. backbrief's dwell/presence ledger) -- narrowed to the one method this middleware actually calls. */
export interface PresenceSink {
  markSeen(actor: TokenActor): void;
}

/**
 * @invariant sets `c.get("actor")` from the bearer token alone -- no request
 *   body field can ever claim an actor
 */
export function authMiddleware(tokens: Tokens, presence: PresenceSink) {
  return async (c: Context, next: Next) => {
    const presented = extractToken(c);
    const actor = identifyActor(presented, tokens); // throws E_AUTH -> caught by the error middleware
    presence.markSeen(actor);
    c.set("actor", actor);
    await next();
  };
}

function extractToken(c: Context): string | undefined {
  const header = c.req.header("Authorization");
  if (header?.startsWith("Bearer ")) return header.slice("Bearer ".length);
  return c.req.query("token");
}

/**
 * @param statusMap this consumer's own error-code -> HTTP-status table (its
 *   error-taxonomy.md pinned to transport codes)
 * @param defaultStatus used for any AppError code not present in
 *   `statusMap` -- treated the same as an unrecognized error (500), never a
 *   silent 200
 * @returns a Hono error handler suitable for `app.onError(...)` -- the
 *   single AppError -> HTTP mapping point
 */
export function makeErrorResponder(
  statusMap: Record<string, HttpStatus>,
  defaultStatus: HttpStatus = 500,
) {
  return function toErrorResponse(error: unknown, c: Context): Response {
    if (error instanceof AppError) {
      // WHY the explicit `AppError<string>` cast: `instanceof` against a
      // generic class (AppError's `Code` type parameter, added for ADR-001)
      // narrows `.code` to `any`, not the default `ErrorCode` union -- core
      // itself must stay agnostic to any ONE consumer's closed code set, so
      // `string` (not `any`) is the correct, explicit widening here.
      const appError = error as AppError<string>;
      const status = statusMap[appError.code] ?? defaultStatus;
      return c.json(
        { error: { code: appError.code, message: appError.message, details: appError.details } },
        status,
      );
    }
    // Unrecognized (non-AppError) failure: "log pointer" -- the response
    // itself never leaks internals.
    console.error("[brief-core] unhandled error", error);
    return c.json({ error: { code: "E_INTERNAL", message: "internal error" } }, 500);
  };
}
