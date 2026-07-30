// Module: matrix/index -- @brief/primitives's "./matrix" entry point
// (package.json `exports` map).
//
// PR6: this entry is pure DOM (kb/primitives/properties.md#PR6: "Matrix and
// claim-without-evidence are pure DOM") -- importing it must never reach
// @hpcc-js/wasm-graphviz nor any file under src/diagram or src/filmstrip.
// See test/pr6-matrix-entry-isolation.test.ts for the static import-graph
// check (reuses step 1's walker, test/support/walk-module-graph.ts).
//
// Key design decision: explicit named re-exports, NOT `export * from` --
// see ../index.ts's header for the full Vite CJS/ESM interop rationale
// this repeats.
export type { MatrixOption, MatrixCriterion, MatrixCell, MatrixBody, MatrixSpec } from "./spec.js";
export { MatrixBodySchema, MatrixSpecSchema } from "./spec.js";

export type { MatrixRenderOutcome } from "./render.js";
export { renderMatrix, renderMatrixBody } from "./render.js";
