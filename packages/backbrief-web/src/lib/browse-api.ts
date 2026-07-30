// Module: lib/browse-api -- GET clients for the step-2 comprehension
// surfaces (tree/file/kb/search/annotations/coverage) + a generic human-
// event poster for the non-annotation event types (impression, question,
// mark_understood, contest, navigation).
//
// Split from lib/api.ts (step 1's annotation-posting + presence module) to
// keep both files under kb/conventions/code-style.md's size budget --
// api.ts's `postAnnotation` stays the annotation-specific path (its own
// citation-shaped payload), while `postHumanEvent` here is the SAME
// POST /api/events durability path (P2) generalized for any other event
// type this step's panels produce.
import {
  ulidGenerator,
  type Citation,
  type ErrorCode,
  type KbRefSpan,
} from "@backbrief/shared/browser";
import type { ApiConfig } from "./api";
import { ApiClientError } from "./error-ui";

function authHeaders(config: ApiConfig): Record<string, string> {
  return { Authorization: `Bearer ${config.humanToken}`, "Content-Type": "application/json" };
}

/** The taxonomy's `{error: {code, message}}` shape (error-taxonomy.md) -- narrowed just enough to build an `ApiClientError` from it. */
interface ApiErrorBody {
  error: { code?: unknown; message?: unknown };
}

function isApiErrorBody(body: unknown): body is ApiErrorBody {
  return typeof body === "object" && body !== null && "error" in body;
}

/**
 * U1 (Phase 5 audit): builds the typed client error from a non-ok
 * response's body, preserving `error.code` (falls back to `E_INTERNAL` if
 * the code is missing/not a string -- a malformed error body is itself an
 * internal-error-shaped situation, never a crash here).
 */
async function apiErrorFrom(res: Response): Promise<ApiClientError> {
  const body: unknown = await res.json().catch(() => null);
  if (isApiErrorBody(body)) {
    const code =
      typeof body.error.code === "string" ? (body.error.code as ErrorCode) : "E_INTERNAL";
    const message =
      typeof body.error.message === "string" ? body.error.message : `HTTP ${String(res.status)}`;
    return new ApiClientError(message, code);
  }
  return new ApiClientError(`HTTP ${String(res.status)}`, "E_INTERNAL");
}

async function getJson<T>(config: ApiConfig, path: string): Promise<T> {
  const res = await fetch(`${config.httpOrigin}${path}`, { headers: authHeaders(config) });
  if (!res.ok) throw await apiErrorFrom(res);
  return (await res.json()) as T;
}

export interface TreeEntry {
  name: string;
  path: string;
  kind: "file" | "dir";
  size?: number;
}
export async function fetchTree(config: ApiConfig, path: string): Promise<TreeEntry[]> {
  const query = path ? `?path=${encodeURIComponent(path)}` : "";
  return (await getJson<{ entries: TreeEntry[] }>(config, `/api/tree${query}`)).entries;
}

export interface FileContent {
  path: string;
  rev: string;
  language: string;
  size: number;
  encoding: "utf8" | "utf8-lossy";
  content: string;
  /** Step 3 (kb/plan.md): detected "kb/....md[#anchor]" spans (shared/kb-ref.ts) -- CodeViewer.tsx renders them as linkified, hover-carded spans. */
  kbReferences: KbRefSpan[];
}
export async function fetchFile(
  config: ApiConfig,
  path: string,
  rev = "worktree",
): Promise<FileContent> {
  return getJson<FileContent>(
    config,
    `/api/file?path=${encodeURIComponent(path)}&rev=${encodeURIComponent(rev)}`,
  );
}

export interface KbFile {
  path: string;
  frontmatter: Record<string, string | string[]>;
  content: string;
  anchors: string[];
  propertyIds: string[];
}
export async function fetchKb(config: ApiConfig, path: string): Promise<KbFile> {
  return getJson<KbFile>(config, `/api/kb?path=${encodeURIComponent(path)}`);
}

export interface SearchMatch {
  path: string;
  line: number;
  column: number;
  text: string;
}
export async function fetchSearch(
  config: ApiConfig,
  query: string,
): Promise<{ matches: SearchMatch[]; truncated: boolean }> {
  if (query.trim() === "") return { matches: [], truncated: false };
  return getJson(config, `/api/search?q=${encodeURIComponent(query)}`);
}

export type AnnotationStatus = "ok" | "reanchored" | "stale" | "archived";
export interface AnnotationView {
  annotationId: string;
  citation: Citation;
  text: string;
  kind: "note" | "concern" | "disagree";
  archived: boolean;
  updatedAt: string;
  sessionId: string;
  status: AnnotationStatus;
  reason?: string;
}
export async function fetchAnnotations(config: ApiConfig): Promise<AnnotationView[]> {
  return (await getJson<{ annotations: AnnotationView[] }>(config, "/api/annotations")).annotations;
}

export type ReaderStatus = "unseen" | "visited" | "questioned" | "understood" | "contested";
export interface CoverageEntry {
  targetPath: string;
  status: ReaderStatus;
  decayedFrom?: ReaderStatus;
}
export interface CoverageMap {
  targets: CoverageEntry[];
  counts: Record<ReaderStatus, number>;
}
export async function fetchCoverage(config: ApiConfig): Promise<CoverageMap> {
  return getJson<CoverageMap>(config, "/api/coverage");
}

/**
 * The uniform durable-event path (P2) for every human event type BESIDES
 * `annotation` (see lib/api.ts's `postAnnotation`): impression, question,
 * mark_understood, contest, navigation.
 * @invariant P2 the caller must treat the event as "sent" only after this resolves
 */
export async function postHumanEvent(
  config: ApiConfig,
  type: string,
  payload: object,
  refs: Citation[] = [],
): Promise<{ id: string; seq: number }> {
  const res = await fetch(`${config.httpOrigin}/api/events`, {
    method: "POST",
    headers: authHeaders(config),
    body: JSON.stringify({ type, refs, clientKey: ulidGenerator.next(), payload }),
  });
  if (!res.ok) {
    const error = await apiErrorFrom(res);
    // U1: re-wraps with the `${type} was not saved` prefix a caller may
    // already depend on for display, but keeps `.code` intact (a plain
    // `Error` here would have thrown away the taxonomy code entirely).
    throw new ApiClientError(`${type} was not saved: ${error.message}`, error.code);
  }
  return (await res.json()) as { id: string; seq: number };
}
