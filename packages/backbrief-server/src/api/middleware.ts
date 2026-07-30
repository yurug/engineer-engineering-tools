// Module: api/middleware -- backbrief's own error-code -> HTTP-status table,
// wired through @brief/core's generic auth/error-mapping mechanism
// (ADR-001: "toErrorResponse takes a status map" -- the original had this
// table hardcoded; only backbrief's OWN 17-code table changed shape, not
// the mapping mechanism itself, so `app.onError(toErrorResponse)` at the
// one call site is unaffected).
import type { ErrorCode } from "@backbrief/shared";
import { authMiddleware, makeErrorResponder, type HttpStatus } from "@brief/core";

export { authMiddleware };

/** HTTP status for each taxonomy code -- kb/spec/error-taxonomy.md doesn't
 *  pin transport status, so this table is the server's own decision. */
const ERROR_HTTP_STATUS: Record<ErrorCode, HttpStatus> = {
  E_AUTH: 401,
  E_ALREADY_RUNNING: 409,
  E_NO_REPO: 400,
  E_SESSION_ENDED: 409,
  E_VALIDATION: 400,
  E_UNGROUNDED_DIAGRAM: 422,
  E_NOT_FOUND: 404,
  E_TOO_LARGE: 413,
  E_BINARY: 415,
  E_BAD_REF: 400,
  E_CONFIG: 500,
  E_PORT_IN_USE: 500,
  E_KB_MISSING: 409,
  // v2 (ADR-005): 422 -- same "well-formed, but semantically rejected"
  // status as E_UNGROUNDED_DIAGRAM, which both new codes are siblings of
  // (an over-budget move / an uncited-or-cyclic map are shape-valid JSON
  // that fails a DOMAIN rule, not a 400-level parse failure).
  E_OVER_BUDGET: 422,
  E_MAP_VALIDATION: 422,
  // v2 step 4 (ADR-005, pedagogy-engine.md#rupture): 409 -- NOT grouped
  // with the 422 pair above (those reject on the PAYLOAD's own shape/
  // content). This rejects a well-formed present_move purely because it
  // conflicts with the session's CURRENT STATE, the exact same reasoning
  // E_SESSION_ENDED (409, above) already uses -- "paused" is a temporary
  // conflict rather than "ended"'s terminal one, but the HTTP semantics are
  // identical.
  E_SESSION_PAUSED: 409,
  E_INTERNAL: 500,
};

/** Registered via `app.onError` -- the single AppError -> HTTP mapping point. */
export const toErrorResponse = makeErrorResponder(ERROR_HTTP_STATUS);
