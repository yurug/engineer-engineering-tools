// Module: claim/html-utils -- minimal, dependency-free HTML text escaping
// for the claim card's build-DOM-as-string output (kb/primitives/
// spec.md#5-assertion-evidence-card). Mirrors ../matrix/html-utils.ts's
// identical three-character escape verbatim; kept as claim's OWN tiny
// copy rather than importing across a primitive-entry boundary
// (claim -> matrix) for one dependency-free helper -- the same scoping
// choice matrix/html-utils.ts's own header already made relative to
// ../svg-utils.ts.
//
// @invariant PR2 -- every spec-provided string (assertion, caveat) reaches
// the rendered output only through escapeHtmlText; ./render.ts never
// interpolates one of these fields raw.
export function escapeHtmlText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
