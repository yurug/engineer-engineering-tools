// Module: http-client -- the CLI's only way to talk to the server.
//
// ADR-001: "The CLI must contain zero business logic -- transport, token
// discovery, exit codes, JSONL passthrough only." This module is that
// transport: it knows how to build an authenticated request against a
// discovered server, nothing about what any endpoint means.
import type { ServerInfo } from "@backbrief/server";

export function baseUrl(info: ServerInfo): string {
  return `http://127.0.0.1:${String(info.port)}`;
}

export function authHeaders(info: ServerInfo): Record<string, string> {
  return { Authorization: `Bearer ${info.token}` };
}

export interface ApiError {
  error: { code: string; message: string; details?: Record<string, unknown> };
}

/** Type guard for the taxonomy's `{error: {code, message}}` response shape (error-taxonomy.md#shape). */
export function isApiError(body: unknown): body is ApiError {
  return typeof body === "object" && body !== null && "error" in body;
}

/**
 * U4 (Phase 5 audit): parses a non-ok response's `{error:{message}}` body
 * for the three commands that used to print a bare `HTTP <status>` and
 * throw away the server's actual, actionable message (act.ts already did
 * this correctly inline via `isApiError` -- this factors the SAME check out
 * so events/digest/stop don't each re-derive it slightly differently).
 * @returns the server's message, or `HTTP <status>` if the body isn't the
 *   taxonomy's shape (a truncated response, a non-backbrief proxy error)
 */
export async function errorMessageFrom(res: Response): Promise<string> {
  const body: unknown = await res.json().catch(() => null);
  return isApiError(body) ? body.error.message : `HTTP ${String(res.status)}`;
}
