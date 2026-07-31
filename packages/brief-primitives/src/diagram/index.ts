// Module: diagram/index -- @brief/primitives's "./diagram" entry
// point (package.json `exports` map).
//
// PR6: importing this file pulls in @hpcc-js/wasm-graphviz (via
// ./graphviz-instance.ts). A consumer that only needs the "." entry's
// trust frame/tokens/schema helpers -- or only ./filmstrip -- must never
// reach this file as a transitive side effect of something else.
//
// Key design decision: explicit named re-exports, NOT `export * from` --
// see ../index.ts's header for the full Vite CJS/ESM interop rationale
// this repeats.
export type {
  DiagramMeaning,
  DiagramNode,
  DiagramEdge,
  DiagramBody,
  DiagramSpec,
} from "./spec.js";
export {
  DiagramMeaningSchema,
  DiagramBodySchema,
  DiagramSpecSchema,
} from "./spec.js";

export type { GraphvizEngine } from "./engine-map.js";
export { ENGINE_BY_MEANING } from "./engine-map.js";

export type { DiagramRenderOutcome } from "./render.js";
export { renderDiagram, renderDiagramBody } from "./render.js";
