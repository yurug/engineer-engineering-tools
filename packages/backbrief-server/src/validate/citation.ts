// Module: validate/citation -- re-exports @brief/core's citation
// validation (ADR-001, "our P1/P10 machinery, whole"). `RepoAccess`/
// `KbAccess` (this package's fuller interfaces) satisfy core's narrower
// `CitationRepoAccess`/`CitationKbAccess` structurally, so every existing
// call site needs no change.
export {
  validateCodeCitation,
  validateKbCitation,
  findMatchingRanges,
  findUniqueRelocation,
  type SearchWindow,
} from "@brief/core";
