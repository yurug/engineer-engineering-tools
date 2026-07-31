// Module: index -- @brief/shared's public surface.
//
// The only file a consumer should import from; a deep import like
// `@brief/shared/dist/citation` works but bypasses this contract.
//
// Explicit named re-exports, NOT `export * from`: TS compiles `export *` to
// a CommonJS runtime loop (`__exportStar`) that a bundler's static CJS->ESM
// analysis cannot see through. A web-side `import { ulidGenerator }`
// silently resolved to `undefined` under `export *` -- caught building
// backbrief's web bundle, not by typecheck, since the .d.ts files ARE
// statically analyzable.
//
// Node-only surface: ./normalize pulls in `node:crypto`. A browser consumer
// imports "./browser" (./index.browser.ts), which is this list minus that
// module. ADDING AN EXPORT HERE? Add it there too.
//
// SCOPE (2026-07-29 split): what is here is what more than one tool needs.
// This package was extracted from backbrief as though all of it were
// shared; ~92% of it was backbrief's own domain -- pedagogy, overlay,
// rupture, devices, sessions, coverage, comprehension maps -- and went back
// there, where the properties constraining it live. The KB's
// enforcement-channel check forced the correction by noticing backbrief
// properties naming tests that had left the repo. See kb/INDEX.md.

export type { ErrorCode, Result } from "./errors";
export { AppError, err, ok } from "./errors";

export type { Clock, IdGenerator } from "./ports";

export { systemClock, ulidGenerator } from "./adapters";

export type {
  Citation,
  CitationInput,
  CitationValidationResult,
  CodeCitation,
  CodeCitationInput,
  KbCitation,
  ValidationState,
} from "./citation";
export {
  CitationInputSchema,
  CitationSchema,
  CodeCitationInputSchema,
  CodeCitationSchema,
  KbCitationSchema,
} from "./citation";

export type { CitationSlot } from "./citation-walk";
export {
  collectCitationInputs,
  mintCodeCitations,
  walkCitations,
} from "./citation-walk";

export type { Actor, Envelope } from "./envelope";
export { EnvelopeSchema, UlidSchema } from "./envelope";

export { isPropertyIdAnchor } from "./kb-anchor";

export { githubHeadingSlug, headingSlugsOf } from "./heading-slug";

export type { FrontierNode, FrontierState, NodeState } from "./frontier";
export {
  FRONTIER_SOURCE_STATES,
  MASTERED_STATES,
  computeFrontier,
} from "./frontier";

export { hashContext, hashLines, normalizeContent } from "./normalize";
