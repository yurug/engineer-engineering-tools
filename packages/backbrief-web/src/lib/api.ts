// Module: lib/api -- the "annotate this card" form's write path and the
// presence poll.
//
// POST /api/events is the uniform durability path for human input (P2);
// this module is the only place in the web app that calls it. `clientKey`
// is generated client-side so a retried submit (e.g. a flaky connection)
// is idempotent (data-model.md#envelope: "server dedupes retried
// submissions on it").
import { ulidGenerator, type CitationInput, type Focus } from "@backbrief/shared/browser";

export interface ApiConfig {
  httpOrigin: string;
  humanToken: string;
}

export interface PresenceSnapshot {
  agentSeen: string | null;
  humanSeen: string | null;
}

function authHeaders(config: ApiConfig): Record<string, string> {
  return { Authorization: `Bearer ${config.humanToken}`, "Content-Type": "application/json" };
}

/**
 * @param input.citation `CitationInput` (rev/contentHash OPTIONAL), not
 *   the canonical `Citation` type -- api-contracts.md#citation-minting:
 *   "the agent never hashes", and the same mint-on-ingest pipeline applies
 *   to human-submitted citations too (kb/plan.md step 2: "client computes
 *   NO hashes, submits path+lines and lets the server mint"). A CALLER
 *   that already has a fully-minted `Citation` (e.g. Card.tsx, copying one
 *   off an already-validated card) may still pass it -- `Citation` is
 *   structurally assignable to `CitationInput`.
 * @param input.annotationId re-post the SAME id to update an existing
 *   annotation (algorithms.md's triage contract: "re-post the same
 *   annotationId with a corrected citation (re-anchor), or with
 *   archived: true (dismiss)" -- TriagePanel.tsx is the caller that
 *   supplies one). Omitted for a brand-new annotation (AnnotateForm.tsx),
 *   which mints a fresh ULID -- never reuses one across two logically
 *   distinct annotations.
 * @param input.archived triage's "dismiss" action (see above)
 * @invariant P2 the browser never renders an annotation as "sent" until the server acks it.
 */
export async function postAnnotation(
  config: ApiConfig,
  input: {
    citation: CitationInput;
    text: string;
    kind: "note" | "concern" | "disagree";
    annotationId?: string;
    archived?: boolean;
  },
): Promise<{ id: string; seq: number }> {
  const res = await fetch(`${config.httpOrigin}/api/events`, {
    method: "POST",
    headers: authHeaders(config),
    body: JSON.stringify({
      type: "annotation",
      clientKey: ulidGenerator.next(),
      payload: {
        annotationId: input.annotationId ?? ulidGenerator.next(),
        citation: input.citation,
        text: input.text,
        kind: input.kind,
        ...(input.archived !== undefined ? { archived: input.archived } : {}),
      },
    }),
  });
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null);
    const message =
      typeof body === "object" && body && "error" in body
        ? String((body as { error: { message?: unknown } }).error.message)
        : `HTTP ${String(res.status)}`;
    throw new Error(`annotation was not saved: ${message}`);
  }
  return (await res.json()) as { id: string; seq: number };
}

/** @invariant P5 read fresh each poll -- never cached across renders (honest presence). */
export async function fetchPresence(config: ApiConfig): Promise<PresenceSnapshot> {
  const res = await fetch(`${config.httpOrigin}/api/session`, { headers: authHeaders(config) });
  if (!res.ok) return { agentSeen: null, humanSeen: null };
  const body = (await res.json()) as { presence: PresenceSnapshot };
  return body.presence;
}

/**
 * One-shot read of the session's BOOT-time focus (`serve --focus ...`) --
 * see lib/session-focus.ts's module header for why this is only the
 * starting point, not the live value (a later `focus_changed` envelope,
 * already flowing through the WS the app is subscribed to, always wins).
 */
export async function fetchSessionFocus(config: ApiConfig): Promise<Focus | undefined> {
  const res = await fetch(`${config.httpOrigin}/api/session`, { headers: authHeaders(config) });
  if (!res.ok) return undefined;
  // Optional chaining, not a bare index: a fetch failure/malformed response
  // must degrade to "no focus known" (free-nav's own default), never throw
  // an unhandled rejection out of this one-shot read -- matching
  // fetchPresence's own "!res.ok -> a safe default" resilience above.
  const body = (await res.json()) as { session?: { focus?: Focus } };
  return body.session?.focus;
}

/**
 * One-shot read of C1's `noKbMode` flag -- server-startup config, not
 * session state that ever changes mid-session (kb-access.ts computes it
 * once at `startServer`), so -- like `fetchSessionFocus` -- this needs no
 * polling or WS wiring, just a single read at mount.
 * @returns `false` (never degraded-mode) if the request itself fails --
 *   matching this module's other one-shot reads: a transient fetch error
 *   must never manufacture a false "no KB" notice out of nothing.
 */
export async function fetchNoKbMode(config: ApiConfig): Promise<boolean> {
  const res = await fetch(`${config.httpOrigin}/api/session`, { headers: authHeaders(config) });
  if (!res.ok) return false;
  const body = (await res.json()) as { noKbMode?: boolean };
  return body.noKbMode ?? false;
}
