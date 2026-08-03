// Module: index -- @brief/core's public surface.
//
// Every consumer (backbrief's own packages, forebrief, any future
// consumer) imports from here only -- explicit named re-exports, NEVER
// `export *` (ADR-001: the documented Vite CJS/ESM interop bug with linked
// workspace packages -- `export *` compiles to a runtime loop a bundler's
// static CJS->ESM interop analysis can't see through; explicit re-exports
// compile to scannable per-binding assignments). ADDING AN EXPORT? Add it
// here, named, or it does not exist for consumers of this package.
export { AppError, type ErrorCode, type Result, ok, err } from "@brief/shared";

export {
  resolveRepoPath,
  resolveStateDirPath,
  isUnderStateDir,
} from "./fsguard";

export {
  generateTokens,
  identifyActor,
  type Tokens,
  type TokenActor,
} from "./auth";

export { resolveRepoRoot } from "./git";

export { loadConfigFile } from "./config";

export {
  daemonizeAndAwaitReady,
  writeServeErrorSentinel,
  type DaemonizeOptions,
  type DaemonizeResult,
} from "./daemon";

export type { CitationRepoAccess, CitationKbAccess } from "./content-access";

export { memoizeRevReads } from "./repo-cache";

export {
  EventStore,
  readEnvelopeLog,
  type AppendInput,
  type AppendResult,
} from "./store/event-store";

export {
  isServerResponding,
  writeServerJson,
  readServerJson,
  removeServerJson,
  recoverStaleArtifactsOrThrow,
  writeLock,
  removeLock,
  isPidAlive,
  type ServerInfo,
  type LockInfo,
} from "./store/discovery";

export { readLock } from "./store/lock";

export { makeCitationMinter, assertMinted, splitRealLines } from "./mint";

export {
  validateCodeCitation,
  validateKbCitation,
  declaresPropertyId,
  findMatchingRanges,
  findUniqueRelocation,
  type SearchWindow,
} from "./validate/citation";

export {
  validateEnvelopeCitations,
  type ValidationReport,
} from "./validate/envelope";

export { revalidatePaths, type RevalidateDeps } from "./validate/revalidate";

export {
  authMiddleware,
  makeErrorResponder,
  type HttpStatus,
  type PresenceSink,
} from "./api/middleware";

export { followEventsRoute, type FollowRouteDeps } from "./api/sse";

export { pumpSseEvents, type PumpSseEventOptions } from "./cli/sse-events";

export { mountStaticWeb } from "./static-web";

export { attachWsHub, type WsHub, type WsHubDeps } from "./ws/hub";
