// Module: diagram/engine-map -- ADR-013's decision made concrete: "the
// spec declares what it is (flow, state machine, dependency graph, concept
// map) and the primitive picks the engine." `DiagramMeaningSchema` never
// grows an `engine` field; this file (plus the ADR) is the mapping's only
// home, exactly as ADR-013's "what this does not cover" asks for.
import type { DiagramMeaning } from "./spec.js";

/**
 * The bundled Graphviz WASM offers ten engines total (circo, dot, fdp,
 * sfdp, neato, osage, patchwork, twopi, nop, nop2 -- verified against
 * `@hpcc-js/wasm-graphviz`'s own `Engine` type at the pinned version).
 * This mapping only ever needs the four below; kept as a local union
 * (rather than importing the wasm package's `Engine` type here) so this
 * file stays readable without pulling the heavy dependency into a type
 * position a non-diagram module might import.
 */
export type GraphvizEngine = "dot" | "neato" | "fdp" | "twopi";

/**
 * `meaning` -> layout engine, exhaustive over `DiagramMeaning` via the
 * `Record` type (a missing case is a compile error, not a silent runtime
 * default -- conventions/code-style.md's exhaustiveness discipline).
 *
 * - `flow` -> `dot`: a directed process with a clear start/end reads best
 *   rank-ordered top-to-bottom.
 * - `state-machine` -> `dot`: states are still fundamentally hierarchical
 *   (initial -> ... -> terminal) for the small FSMs this package targets;
 *   `circo`'s circular layout was considered and rejected for reading
 *   worse on that common case.
 * - `dependency` -> `dot`: a dependency graph is a DAG in the common case;
 *   rank-based layout communicates "what depends on what" directly.
 * - `concept-map` -> `neato`: concept maps are not inherently hierarchical;
 *   `neato`'s spring-model layout groups related concepts spatially
 *   instead of forcing a top-down rank order that doesn't exist.
 * - `causal-chain` -> `dot`: a chain of causes and effects is a straight
 *   line; `dot` with `rankdir=LR` (./dot.ts) renders it left-to-right.
 */
export const ENGINE_BY_MEANING: Record<DiagramMeaning, GraphvizEngine> = {
  flow: "dot",
  "state-machine": "dot",
  dependency: "dot",
  "concept-map": "neato",
  "causal-chain": "dot",
};
