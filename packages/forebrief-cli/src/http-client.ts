// Module: http-client -- a thin, shared authenticated-fetch wrapper for
// `post`/`act`/`events`/`digest` (kb/spec/cli-contract.md's HTTP surface).
import type { ServerInfo } from "@forebrief/server";
import { formatIssuePath } from "@forebrief/server";

export interface ApiError {
  code: string;
  message: string;
  /** E_SCHEMA carries `{issues: ZodIssue[]}` here -- see `describeApiError`. */
  details?: Record<string, unknown>;
}

/**
 * @returns `error.message` (already field-path-prefixed server-side, per
 *   kb/spec/error-taxonomy.md's E_SCHEMA row), with every OTHER reported
 *   field path appended when `details.issues` holds more than the one
 *   already named in the message -- Phase-5 audit finding: the CLI used to
 *   read only `.message` and never `.details`, discarding every issue past
 *   the first.
 */
export function describeApiError(error: ApiError): string {
  const issues = error.details?.["issues"];
  if (!Array.isArray(issues) || issues.length <= 1) return error.message;
  const paths = issues
    .map((issue: unknown) => {
      const path = (issue as { path?: unknown } | undefined)?.path;
      return Array.isArray(path) ? formatIssuePath(path) : undefined;
    })
    .filter((p): p is string => Boolean(p));
  if (paths.length === 0) return error.message;
  return `${error.message} [fields: ${paths.join(", ")}]`;
}

export type ApiResult<T> = { ok: true; body: T } | { ok: false; error: ApiError };

function baseUrl(info: ServerInfo): string {
  return `http://127.0.0.1:${String(info.port)}`;
}

async function toResult<T>(res: Response): Promise<ApiResult<T>> {
  if (res.ok) return { ok: true, body: (await res.json()) as T };
  const body = (await res.json().catch(() => ({}))) as { error?: ApiError };
  return {
    ok: false,
    error: body.error ?? { code: "E_INTERNAL", message: `HTTP ${String(res.status)}` },
  };
}

export async function postJson<T>(
  info: ServerInfo,
  path: string,
  payload: unknown,
): Promise<ApiResult<T>> {
  const res = await fetch(`${baseUrl(info)}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${info.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return toResult<T>(res);
}

/** @returns the raw response body as text (JSONL/markdown endpoints -- no JSON envelope to unwrap on success). */
export async function getText(info: ServerInfo, path: string): Promise<ApiResult<string>> {
  const res = await fetch(`${baseUrl(info)}${path}`, {
    headers: { Authorization: `Bearer ${info.token}` },
  });
  if (res.ok) return { ok: true, body: await res.text() };
  const body = (await res.json().catch(() => ({}))) as { error?: ApiError };
  return {
    ok: false,
    error: body.error ?? { code: "E_INTERNAL", message: `HTTP ${String(res.status)}` },
  };
}

export function eventsUrl(info: ServerInfo, path: string): string {
  return `${baseUrl(info)}${path}`;
}
