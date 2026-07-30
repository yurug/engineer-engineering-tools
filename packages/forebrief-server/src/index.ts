// Module: index -- @forebrief/server's public surface.
//
// @forebrief/cli depends only on this file (mirrors @backbrief/server's own
// index.ts, ADR-001) -- nothing else in this package is meant to be
// imported directly from outside.
export { startServer, type ServerHandle, type StartServerOptions } from "./server";
export { readServerJson, isPidAlive, type ServerInfo } from "./discovery";
export { resolveRepoRoot } from "@brief/core";
export type {
  CardValidationReport,
  CitationReportEntry,
  StoredCard,
  StoredRound,
} from "./types/round";
export { loadConfig, type Config, type FoldInConfig } from "./config";
// E_SCHEMA diagnostics (kb/spec/error-taxonomy.md): the CLI reads
// `ApiError.details.issues` and needs the SAME path formatting the server
// baked into the message, so a multi-issue failure's OTHER paths render
// identically to the first one already in `.message`.
export { formatIssuePath } from "./schema-error";
// Step 4: `forebrief fold`'s public surface (kb/architecture/decisions/
// ADR-005-fold-in-contract.md) -- read-side data (fold/support.ts) plus
// pure markdown rendering (fold/render.ts); no write path exists in either.
export {
  loadFoldSources,
  foldStateForCard,
  findRound,
  findCard,
  type CardFoldState,
} from "./fold/support";
export {
  renderRoundDigest,
  renderAdrCard,
  loadTemplate,
  formatId,
  nextRoundDigestNumber,
  nextAdrNumber,
  type RenderedFile,
} from "./fold/render";
