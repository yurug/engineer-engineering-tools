// Module: lib/annotations-inbox -- the annotations inbox's data: a live
// count (ADR-007: "annotations get their own returnable inbox... posting an
// annotation updates the inbox count, never the brief") plus, per
// annotation, any agent reaction threaded to it.
//
// GENUINE PROTOCOL GAP (flagged in this step's report, not fixable from web
// alone): kb/spec/interaction-model.md says "the agent's reaction is
// threaded there (`inReplyTo` the annotationId)" -- but no agent-postable
// message carries that field today. Checked: shared/events.ts's
// `AgentPostableEventSchema` (answer/open_finding/resolve_finding/
// kb_proposal/resolve_proposal -- none has `inReplyTo`) and shared/actions.ts's
// `PostCardAction` (agent free-text cards -- also no `inReplyTo`). Rather
// than inventing a NEW wire field from the web package (a shared+server
// change, out of this step's WEB-ONLY scope), `findAnnotationReactions`
// below scans GENERICALLY for any envelope whose payload duck-types an
// `inReplyTo` matching an annotationId -- so the inbox lights up the moment
// a future shared/server commit adds a real reaction message, without this
// file needing to change. As of R7-3 nothing produces one, so this list is
// expected to be empty in practice today; that is the gap, not a bug here.
import { useEffect, useState } from "react";
import { fetchAnnotations, type AnnotationView } from "./browse-api";
import type { ApiConfig } from "./api";
import type { Envelope } from "@backbrief/shared/browser";

interface InReplyToPayload {
  inReplyTo?: string;
}

export interface AnnotationReaction {
  envelopeId: string;
  actor: Envelope["actor"];
  text: string;
}

/** Best-effort text extraction across the several agent message shapes that
 *  COULD plausibly carry a reply someday (`text`/`markdown`/`say`/`body`/
 *  `summary`/`plan`) -- falls back to the raw payload so nothing is ever
 *  silently dropped once a real reaction message exists. */
function reactionTextFrom(payload: unknown): string {
  if (typeof payload !== "object" || payload === null) return "";
  const record = payload as Record<string, unknown>;
  for (const key of ["text", "markdown", "say", "body", "summary", "plan"]) {
    const value = record[key];
    if (typeof value === "string") return value;
  }
  return JSON.stringify(payload);
}

/** @returns every envelope in the stream whose payload references `annotationId` via `inReplyTo`, in stream order -- see module header on why this is (today) usually `[]`. */
export function findAnnotationReactions(
  envelopes: readonly Envelope[],
  annotationId: string,
): AnnotationReaction[] {
  const reactions: AnnotationReaction[] = [];
  for (const envelope of envelopes) {
    const payload = envelope.payload as unknown as InReplyToPayload;
    if (payload.inReplyTo === annotationId) {
      reactions.push({
        envelopeId: envelope.id,
        actor: envelope.actor,
        text: reactionTextFrom(envelope.payload),
      });
    }
  }
  return reactions;
}

/** @returns the count of OPEN (non-archived) annotations -- the inbox's badge, and the ONLY pending-annotation number that surfaces on the TabBar besides Map's own combined count (lib/pending-badges.ts, a pre-ADR-007 mechanism this step's inbox now supersedes for annotations specifically). */
export function countOpenAnnotations(annotations: readonly AnnotationView[]): number {
  return annotations.filter((a) => !a.archived).length;
}

/**
 * Fetches GET /api/annotations at mount and re-fetches whenever a NEW
 * `annotation` envelope arrives on the live WS stream (covers both a fresh
 * post and an archive/dismiss re-post, both `type: "annotation"`) -- the
 * envelope COUNT is the trigger, not a poll timer, so "posting an
 * annotation updates the inbox count" (ADR-007) happens on the SAME event
 * that already drives every other live update in this app.
 * @returns `[]` on any fetch failure or a malformed response body --
 *   mirrors lib/glossary-api.ts's own degrade-silently contract; the inbox
 *   is progressive enhancement, never a blocking dependency.
 */
export function useAnnotationsInbox(
  api: ApiConfig,
  envelopes: readonly Envelope[],
): AnnotationView[] {
  const [annotations, setAnnotations] = useState<AnnotationView[]>([]);
  const annotationEnvelopeCount = envelopes.filter((e) => e.type === "annotation").length;

  useEffect(() => {
    let cancelled = false;
    fetchAnnotations(api)
      .then((fetched) => {
        if (!cancelled) setAnnotations(Array.isArray(fetched) ? fetched : []);
      })
      .catch(() => {
        if (!cancelled) setAnnotations([]);
      });
    return () => {
      cancelled = true;
    };
    // `annotationEnvelopeCount` (not `envelopes` itself) is the intended key
    // -- re-fetching on every unrelated envelope would be wasted work; see
    // this function's own doc comment for why the count is the right proxy.
  }, [api, annotationEnvelopeCount]);

  return annotations;
}
