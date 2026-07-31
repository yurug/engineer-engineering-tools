// Module: index -- @brief/primitives's "." entry point.
//
// kb/primitives/implementation-slices.md Step 1 / PR6: "a renderer loads
// only when its spec appears." This entry carries ONLY the shared
// envelope/types, trust chrome, tokens, the schema-error formatter, and
// the skew-version contract -- nothing here imports Graphviz (or, later,
// Vega). A consumer rendering only a matrix (step 2) or sniffing a spec's
// `kind` to decide which entry to load next must be able to import this
// file alone and instantiate no WebAssembly. See
// test/pr6-entry-isolation.test.ts for the static check.
//
// Key design decision: explicit named re-exports, NOT `export * from` --
// packages/core/src/index.ts and packages/shared/src/index.ts already
// carry the full rationale (ADR-001: the documented Vite CJS/ESM interop
// bug with linked workspace packages -- `export *` compiles to a runtime
// loop a bundler's static analysis can't see through, silently dropping
// named bindings). Same discipline here, including across ./diagram and
// ./filmstrip's own index.ts files.
export type {
  PrimitiveKind,
  Trust,
  PrimitiveEnvelopeShape,
} from "./envelope.js";
export {
  PrimitiveKindSchema,
  TrustSchema,
  envelopeFields,
  sniffPrimitiveKind,
} from "./envelope.js";

export {
  formatIssuePath,
  schemaErrorMessage,
  PrimitiveSchemaError,
} from "./schema-error.js";

export type { SchemaVersionCheck } from "./version.js";
export {
  PRIMITIVES_SCHEMA_VERSION,
  PRIMITIVES_REFRESH_COMMAND,
  checkSchemaVersion,
} from "./version.js";

export { renderSkewBanner } from "./skew-banner.js";
export type { SkewBannerInfo } from "./skew-banner.js";

export type { Tokens } from "./tokens.js";
export { TOKENS, tokensToCssDeclarations } from "./tokens.js";

export type { TrustFrameOptions } from "./trust-frame.js";
export { wrapWithTrustFrame } from "./trust-frame.js";

export type { SvgDimensions } from "./svg-utils.js";
export { svgDimensions, svgBody, escapeXmlText } from "./svg-utils.js";
