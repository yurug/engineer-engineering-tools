// Module: lib/api -- the browser's two HTTP calls (kb/spec/cli-contract.md's
// HTTP surface): bootstrap (`GET /api/state`) and every human-postable
// record (`POST /api/records`). WS (`/ws?token=`) is lib/use-forebrief-
// socket.ts's concern, not this file's.
import type { RecordSubmission, StateResponse } from "./types";

export interface ApiConfig {
  httpOrigin: string;
  humanToken: string;
}

function authHeaders(config: ApiConfig): Record<string, string> {
  return { Authorization: `Bearer ${config.humanToken}`, "Content-Type": "application/json" };
}

/** Mirrors @forebrief/server's schema-error.ts / @forebrief/cli's
 *  http-client.ts formatting -- this package deliberately has no
 *  dependency on either (lib/types.ts's header), so the shape is
 *  hand-mirrored, same as every other wire type in this file. */
function formatIssuePath(path: readonly unknown[]): string {
  return path.reduce<string>((acc, segment) => {
    if (typeof segment === "number") return `${acc}[${String(segment)}]`;
    const key = String(segment);
    return acc.length === 0 ? key : `${acc}.${key}`;
  }, "");
}

/** @returns an E_SCHEMA error's message, with every field path in
 *  `details.issues` beyond the first (already baked into `.message`
 *  server-side) appended -- Phase-5 audit finding: this client read only
 *  `.message` and never `.details`. */
function describeApiError(error: { message?: unknown; details?: unknown }): string {
  const message = typeof error.message === "string" ? error.message : "unknown error";
  const details = error.details;
  const issues =
    details && typeof details === "object"
      ? (details as Record<string, unknown>)["issues"]
      : undefined;
  if (!Array.isArray(issues) || issues.length <= 1) return message;
  const paths = issues
    .map((issue: unknown) => {
      const path = (issue as { path?: unknown } | undefined)?.path;
      return Array.isArray(path) ? formatIssuePath(path) : undefined;
    })
    .filter((p): p is string => Boolean(p));
  if (paths.length === 0) return message;
  return `${message} [fields: ${paths.join(", ")}]`;
}

/**
 * @throws whatever `fetch` itself throws on a network failure (connection
 *   refused, DNS, etc.) -- callers (lib/server-gone.ts) rely on this
 *   throwing, never resolving with a fake "empty" state, so "the server is
 *   gone" (T2) is never confused with "the round is empty".
 * @throws Error if the server responds but not with 200 (an auth/schema
 *   failure is a real error, not "server gone")
 */
export async function fetchState(config: ApiConfig): Promise<StateResponse> {
  const res = await fetch(`${config.httpOrigin}/api/state`, { headers: authHeaders(config) });
  if (!res.ok) throw new Error(`GET /api/state failed: HTTP ${String(res.status)}`);
  return (await res.json()) as StateResponse;
}

/**
 * @invariant P6: the caller may treat a resolved promise as "durable" --
 *   the server does not ack until `EventStore.append`'s fsync completes.
 * @throws whatever `fetch` throws on a network failure, OR an `Error` if
 *   the server rejected the submission (schema/seq-conflict) -- callers
 *   distinguish "network failure, buffer it" (lib/local-buffer.ts) from
 *   "the server said no" (a real bug, never silently swallowed) by this
 *   throw always carrying a `status` when the fetch itself succeeded.
 */
export async function postRecord(
  config: ApiConfig,
  submission: RecordSubmission,
): Promise<{ id: string; seq: number }> {
  const res = await fetch(`${config.httpOrigin}/api/records`, {
    method: "POST",
    headers: authHeaders(config),
    body: JSON.stringify(submission),
  });
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null);
    const message =
      typeof body === "object" && body && "error" in body
        ? describeApiError((body as { error: { message?: unknown; details?: unknown } }).error)
        : `HTTP ${String(res.status)}`;
    const error = new Error(`record was not saved: ${message}`) as Error & { status: number };
    error.status = res.status;
    throw error;
  }
  return (await res.json()) as { id: string; seq: number };
}
