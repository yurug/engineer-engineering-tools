// Module: index.browser -- @brief/shared's surface minus the one Node-only
// capability (content hashing).
//
// Fixes a real, reproduced build warning: `vite build` emitted
// `Module "node:crypto" has been externalized for browser compatibility,
// imported by ".../shared/dist/normalize.js"` -- ./index.ts re-exports
// `hashLines`/`normalizeContent`, which call `createHash`. A browser never
// hashes (minting and validation are server-side), but Vite's static graph
// still reaches the import and warns.
//
// Kept in sync with ./index.ts by hand: adding an export there means adding
// it here, unless it is Node-only.

export type { ErrorCode, Result } from "./errors";
export { AppError, err, ok } from "./errors";

export type { Clock, IdGenerator } from "./ports";

export { systemClock, ulidGenerator } from "./adapters";

export type { Citation, CitationInput, CitationValidationResult, CodeCitation, CodeCitationInput, KbCitation, ValidationState } from "./citation";
export { CitationInputSchema, CitationSchema, CodeCitationInputSchema, CodeCitationSchema, KbCitationSchema } from "./citation";

export type { CitationSlot } from "./citation-walk";
export { collectCitationInputs, mintCodeCitations, walkCitations } from "./citation-walk";

export type { Actor, Envelope } from "./envelope";
export { EnvelopeSchema, UlidSchema } from "./envelope";

export { isPropertyIdAnchor } from "./kb-anchor";

export { githubHeadingSlug, headingSlugsOf } from "./heading-slug";

export type { FrontierNode, FrontierState, NodeState } from "./frontier";
export { FRONTIER_SOURCE_STATES, MASTERED_STATES, computeFrontier } from "./frontier";
