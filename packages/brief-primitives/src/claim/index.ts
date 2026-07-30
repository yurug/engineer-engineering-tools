// Module: claim/index -- @brief/primitives's "./claim" entry point
// (package.json `exports` map).
//
// PR6: importing this file alone reaches NEITHER Graphviz NOR Vega, and
// no file under src/diagram, src/filmstrip, src/chart, or src/matrix --
// evidence rendering dispatches lazily, by kind, via dynamic `import()`
// inside ./dispatch.ts (invisible to a static source-graph walk, exactly
// like ./chart/render.ts's own vega/vega-lite imports). See
// test/pr6-claim-entry-isolation.test.ts.
//
// Key design decision: explicit named re-exports, NOT `export * from` --
// see ../index.ts's header for the full Vite CJS/ESM interop rationale
// this repeats.
export type { EvidenceEnvelope, ClaimBody, ClaimSpec } from "./spec.js";
export { ClaimBodySchema, ClaimSpecSchema } from "./spec.js";

export type { AssertionCheck } from "./assertion-heuristic.js";
export { looksLikeAssertion, ASSERTION_VERB_WORDS } from "./assertion-heuristic.js";

export type { ClaimRenderOutcome } from "./render.js";
export { renderClaim } from "./render.js";
