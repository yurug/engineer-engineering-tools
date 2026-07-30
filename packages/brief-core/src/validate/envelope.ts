// Module: validate/envelope -- builds the full validation report for one
// action/event/record: {results: [...], flagged: number}.
//
// Extracted from @backbrief/server (ADR-001). Combines the generic citation
// walker (`@brief/shared`) with the two per-kind validators (./citation)
// so callers never need to know where in a payload a citation lives -- the
// walker already found that.
// Key design decision: `flagged` counts BOTH "drifted" and "broken" results,
// not broken alone -- a drifted citation WAS stale as submitted (even
// though repair salvaged the render), so it is degraded in the same sense
// broken is; that is the signal a caller ties its "citations need fixing"
// exit path to.
import {
  collectCitationInputs,
  type Citation,
  type CitationValidationResult,
} from "@brief/shared";
import type { CitationRepoAccess, CitationKbAccess } from "../content-access";
import { validateCodeCitation, validateKbCitation } from "./citation";

export interface ValidationReport {
  results: CitationValidationResult[];
  flagged: number;
}

/**
 * @param value an already-minted action/event/record (every code citation
 *   has rev/contentHash populated -- see ./mint.ts)
 * @invariant walks refs UNION every citation-typed payload field, because
 *   the walker is structural, not a hand-maintained field list
 */
export async function validateEnvelopeCitations(
  value: unknown,
  repo: CitationRepoAccess,
  kb: CitationKbAccess,
): Promise<ValidationReport> {
  // Safe cast: by this point in the pipeline (post-mint), every citation
  // input the walker finds is a canonical Citation (rev/contentHash always
  // present) -- mint.ts guarantees it, never leaving an input-shaped citation behind.
  const citations = collectCitationInputs(value) as Citation[];
  const results = await Promise.all(
    citations.map((citation) =>
      citation.kind === "code"
        ? validateCodeCitation(citation, repo)
        : validateKbCitation(citation, kb),
    ),
  );
  const flagged = results.filter((r) => r.state !== "valid").length;
  return { results, flagged };
}
