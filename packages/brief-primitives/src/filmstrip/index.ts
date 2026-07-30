// Module: filmstrip/index -- @brief/primitives's "./filmstrip" entry
// point (package.json `exports` map).
//
// Importing this file pulls in @hpcc-js/wasm-graphviz transitively (via
// ./layout.ts -> ../diagram/render.ts): a filmstrip's base is a
// DiagramBody, so it carries the same Graphviz WebAssembly cost as
// ./diagram (PR6 states this as a GIVEN, not a violation -- only a
// matrix-only or claim-without-evidence consumer must avoid it).
//
// Key design decision: explicit named re-exports, NOT `export * from` --
// see ../index.ts's header for the full Vite CJS/ESM interop rationale
// this repeats.
export type { FilmstripStep, FilmstripSpec } from "./spec.js";
export { FilmstripStepSchema, FilmstripSpecSchema, edgeId } from "./spec.js";

export type { FilmstripStepOutput, FilmstripRenderOutcome } from "./render.js";
export { renderFilmstrip, renderFilmstripSteps } from "./render.js";

export type { FilmstripStepperTarget, FilmstripStepper } from "./stepper.js";
export { createFilmstripStepper } from "./stepper.js";
