// Module: kb-anchor -- the property/edge-case ID anchor-SHAPE test.
//
// Split out of server/src/kb-access.ts (step 1) so the pure reader-state
// fold (./reader-state.ts) can classify a KbCitation's anchor as "a
// property/edge-case ID" vs. "a heading slug" WITHOUT pulling server's
// fs-backed KB reader (which resolves whether the id is actually
// *declared* somewhere, an I/O operation) into `shared`. This file only
// answers the SHAPE question ("does this string look like P4/NF1/T9?"),
// which is pure and needed on both sides of the fs boundary:
// server/kb-access.ts re-exports it for its own declaresPropertyId/anchor
// validation, and shared/reader-state.ts uses it to decide whether a
// question's or annotation's target-path is `path` (file-level) or
// `path#ID` (property-level) -- data-model.md#reader-state's targetPath
// format.
const PROPERTY_ID = /^(P|NF|T)\d+$/;

/** True if `anchor` has the P<N>/NF<N>/T<N> shape -- kb/GLOSSARY.md's ID convention. */
export function isPropertyIdAnchor(anchor: string): boolean {
  return PROPERTY_ID.test(anchor);
}
