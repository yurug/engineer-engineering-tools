// Module: diagram/graphviz-instance -- loads @hpcc-js/wasm-graphviz once
// per process and renders one DOT string to SVG.
//
// Package choice (forebrief decision, dogfood record): @hpcc-js/wasm-
// graphviz (Apache-2.0, zero runtime `dependencies` in its own
// package.json, verified at install). Verified by unpacking the installed
// tarball (version pinned in package.json) that its `dist/index.js`
// contains no `readFileSync`, no `import.meta.url`-relative asset path,
// and no hardcoded remote URL -- rendering a sample graph with the
// process's global `fetch` wrapped to log any call made zero network
// requests. The WASM binary itself is not stored as a separate `.wasm`
// file or as a base64/`\xNN`-escaped string; it is compressed and
// embedded directly in `dist/index.js`, decompressed by a small inline
// decoder the FIRST time `Graphviz.load()` runs. This satisfies both the
// "WASM inlined" requirement and the no-external-network CSP constraint
// (kb/primitives/implementation-slices.md Step 1: "bundled Graphviz
// WASM... under a no-external-network CSP").
//
// WASM memory disposal hazard (task's "own the hazard inside the
// wrapper"): this module NEVER uses the library's programmatic
// Graph/Subgraph builder API, whose objects each require a manual
// `.delete()` (or `using`) call -- forgetting one leaks WASM heap memory,
// per that API's own JSDoc ("Call delete()... when finished to release
// the underlying WASM object"). It only ever calls the string-in/string-
// out `Graphviz.layout(dotSource, format, engine)`, whose installed
// implementation (read directly from node_modules at the pinned version)
// creates exactly one internal `CGraphviz` instance per call and frees it
// in a `finally` block before returning. There is no per-render
// disposal left for us to own; the hazard is fully contained inside the
// one call this module makes.
//
// Documented surprise (also read from source, not the public docs):
// `Graphviz.layout()` calls the library's OWN `Graphviz.unload()` on any
// render error, discarding the memoized WASM instance -- the next
// successful `Graphviz.load()` after an error re-instantiates the module.
// This is the library's behavior, not ours to work around; the only cost
// is one extra WASM instantiation after the first failed render in a
// process.
import { Graphviz } from "@hpcc-js/wasm-graphviz";
import type { GraphvizEngine } from "./engine-map.js";

let graphvizPromise: Promise<Graphviz> | undefined;

/** Memoized across calls in this process. `Graphviz.load()` also memoizes
 *  internally (a module-level promise inside the library), but caching
 *  the promise here avoids re-entering that machinery on every render. */
function loadGraphviz(): Promise<Graphviz> {
  graphvizPromise ??= Graphviz.load();
  return graphvizPromise;
}

/**
 * @param dot a DOT-language source string (see ./dot.ts's `buildDot`) --
 *   already validated/escaped, never raw spec content.
 * @param engine the layout engine ADR-013's mapping selected for this
 *   spec's `meaning`.
 * @returns the rendered SVG document as a string.
 * @invariant PR9 -- Graphviz's layout is a pure function of `(dot,
 *   engine)`; the SVG comment banner it emits carries only its own
 *   version string, no timestamp, so two calls with the same arguments
 *   produce byte-identical output.
 */
export async function layoutDot(dot: string, engine: GraphvizEngine): Promise<string> {
  const graphviz = await loadGraphviz();
  return graphviz.layout(dot, "svg", engine);
}
