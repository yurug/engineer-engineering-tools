// Module: lib/error-ui -- U1 (Phase 5 audit): exhaustive ErrorCode -> UI-
// treatment mapping, plus the typed client error the fetch helpers raise so
// a rendering boundary can look this mapping up instead of pattern-matching
// on a raw message string.
//
// kb/spec/error-taxonomy.md defines the server's closed `ErrorCode` set and
// says the UI's contract is "banner or inline state -- never a raw code
// without a sentence" -- but nothing on the client side previously enforced
// that per-code, so a component that wanted to render, say, E_TOO_LARGE
// differently from E_NOT_FOUND had no compile-checked way to do it, and the
// fetch helpers (lib/browse-api.ts) discarded `error.code` entirely,
// keeping only the message string. `Record<ErrorCode, UiState>` below is
// the same "exhaustive-by-construction" trick api/middleware.ts's
// `ERROR_HTTP_STATUS` already uses server-side: adding a code to the shared
// union without a matching entry here is a `tsc` failure, not a runtime gap
// discovered later.
import type { ErrorCode } from "@backbrief/shared";

/** How prominently/urgently a surfaced error should read -- a component
 *  picks a CSS class or icon off this, never off the raw code string. */
export type UiTone = "error" | "warning" | "info";

export interface UiState {
  tone: UiTone;
  /** Shown only if the server response carried no message -- should not
   *  happen in practice (every AppError has one, error-taxonomy.md), but a
   *  UI boundary must never render nothing just because that promise broke. */
  fallback: string;
}

/**
 * @invariant U1 exhaustive over every `ErrorCode` the shared taxonomy
 *   defines -- a missing entry fails `tsc`, not a future bug report
 */
export const uiFor: Record<ErrorCode, UiState> = {
  E_AUTH: {
    tone: "error",
    fallback: "Not authorized -- re-open the link `backbrief serve` printed.",
  },
  E_ALREADY_RUNNING: {
    tone: "warning",
    fallback: "A session is already running for this repo.",
  },
  E_NO_REPO: { tone: "error", fallback: "This directory is not inside a git repository." },
  E_SESSION_ENDED: { tone: "warning", fallback: "This session has ended." },
  E_VALIDATION: { tone: "warning", fallback: "That request was malformed." },
  E_UNGROUNDED_DIAGRAM: {
    tone: "warning",
    fallback: "Every citation in this diagram is broken.",
  },
  E_NOT_FOUND: { tone: "warning", fallback: "Not found." },
  E_TOO_LARGE: { tone: "warning", fallback: "This file is too large to display." },
  E_BINARY: { tone: "info", fallback: "Binary file -- use the download link instead." },
  E_BAD_REF: { tone: "warning", fallback: "That git ref does not resolve." },
  E_CONFIG: { tone: "error", fallback: "The repo's .backbrief/config.json is invalid." },
  E_PORT_IN_USE: { tone: "error", fallback: "The chosen port is already in use." },
  E_KB_MISSING: { tone: "info", fallback: "No knowledge base is configured for this repo." },
  // v2 (ADR-005): the move loop's two new domain-rejection codes.
  E_OVER_BUDGET: {
    tone: "warning",
    fallback: "That move exceeds its attention budget.",
  },
  E_MAP_VALIDATION: {
    tone: "warning",
    fallback: "That map update is not citable and falsifiable (P13).",
  },
  // v2 step 4 (pedagogy-engine.md#rupture): only ever seen by the AGENT
  // (present_move is agent-only, api-contracts.md) -- included here anyway
  // for U1's exhaustiveness, matching every other agent-only code's own
  // fallback treatment (E_MAP_VALIDATION, E_OVER_BUDGET, above).
  E_SESSION_PAUSED: {
    tone: "info",
    fallback: "The session is paused for a change break.",
  },
  E_INTERNAL: { tone: "error", fallback: "Something went wrong on the server." },
};

/**
 * The fetch layer's typed failure -- preserves the taxonomy's `code`
 * alongside the server's own message, so a UI boundary can look it up in
 * `uiFor` instead of pattern-matching text (browse-api.ts's `getJson`/
 * `postHumanEvent` are U1's two required call sites; other fetch helpers in
 * this package are unaffected until they need the same treatment).
 */
export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly code: ErrorCode,
  ) {
    super(message);
    this.name = "ApiClientError";
    // Same CommonJS prototype-chain caveat @brief/shared's AppError
    // documents (errors.ts) -- `instanceof ApiClientError` must survive a
    // catch block after compilation.
    Object.setPrototypeOf(this, ApiClientError.prototype);
  }
}

/** @returns the tone + text a UI boundary should render for any caught fetch error, `ApiClientError` or not (a network failure, a JSON parse error, etc. all still need SOME message rather than a blank pane -- U2). */
export function describeError(error: unknown): { tone: UiTone; text: string } {
  if (error instanceof ApiClientError) {
    const state = uiFor[error.code];
    return { tone: state.tone, text: error.message || state.fallback };
  }
  return { tone: "error", text: error instanceof Error ? error.message : "Something went wrong." };
}
