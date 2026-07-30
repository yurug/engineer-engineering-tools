// Module: validate/revalidate -- fresh validation for every citation
// touching a given set of paths, shared by a HEAD watcher and an explicit
// "revalidate" request.
//
// Extracted from @backbrief/server (ADR-001, "our P1/P10 machinery,
// whole"). Both callers need the identical operation -- "find every
// citation anywhere in this log's history that names one of these paths,
// and validate it fresh" -- so it lives here once rather than being
// reimplemented per caller.
// Key design decision: citations are gathered from the WHOLE event log (not
// just filtered to "still referenced by a rendered card") because a
// citation that already scrolled out of the visible feed can still be the
// one a coverage/annotation view is showing -- grounding makes no exception
// for "old" citations, so neither does this. Deduplication (by structural
// identity) keeps a citation cited by ten different cards from being
// validated ten times.
import {
  collectCitationInputs,
  type Citation,
  type CitationValidationResult,
} from "@brief/shared";
import type { EventStore } from "../store/event-store";
import type { CitationRepoAccess, CitationKbAccess } from "../content-access";
import { validateCodeCitation, validateKbCitation } from "./citation";

export interface RevalidateDeps {
  eventStore: EventStore;
  repo: CitationRepoAccess;
  kb: CitationKbAccess;
}

/** A stable, order-independent identity for a citation -- two envelopes citing the "same" lines dedupe to one validation pass. */
function citationKey(citation: Citation): string {
  return citation.kind === "code"
    ? `code:${citation.path}:${String(citation.startLine)}:${String(citation.endLine)}:${citation.rev}`
    : `kb:${citation.path}:${citation.anchor}`;
}

/**
 * @param paths repo-relative paths to revalidate citations against
 * @param deps where to read the log history (for citations) and resolve
 *   content (for validation) from
 * @returns fresh validation results for every distinct citation, across the
 *   whole log, whose `path` is in `paths` -- empty if `paths` is empty or
 *   nothing cites any of them
 * @invariant validation is always recomputed here, never read from a cache
 *   -- the same "grounded or flagged, checked at render/revalidate time"
 *   rule as every other validation path
 */
export async function revalidatePaths(
  paths: readonly string[],
  deps: RevalidateDeps,
): Promise<CitationValidationResult[]> {
  if (paths.length === 0) return [];
  const pathSet = new Set(paths);
  const seen = new Map<string, Citation>();
  for (const envelope of deps.eventStore.readSince(0)) {
    for (const citation of collectCitationInputs(envelope) as Citation[]) {
      if (pathSet.has(citation.path)) seen.set(citationKey(citation), citation);
    }
  }
  return Promise.all(
    [...seen.values()].map((citation) =>
      citation.kind === "code"
        ? validateCodeCitation(citation, deps.repo)
        : validateKbCitation(citation, deps.kb),
    ),
  );
}
