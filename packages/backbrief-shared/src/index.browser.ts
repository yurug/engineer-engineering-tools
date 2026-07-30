// Module: index.browser -- @backbrief/shared's public surface, minus the
// one Node-only capability (content hashing).
//
// Step 2 fix for a real, reproduced build warning: `vite build` on
// packages/web emitted `Module "node:crypto" has been externalized for
// browser compatibility, imported by ".../shared/dist/normalize.js"` --
// because ./index.ts's barrel re-exports `hashLines`/`normalizeContent`
// (./normalize.ts), which calls `node:crypto`'s `createHash`. `web` never
// actually CALLS either function (hashing is a server-side minting/
// validation concern -- kb/spec/api-contracts.md#citation-minting: "the
// agent never hashes", and the browser never hashes either), but Vite's
// static bundle graph still reaches the import and warns. This file is
// the SAME surface as ./index.ts, minus those two exports, so `web`
// imports from `@backbrief/shared/browser` (see package.json's `exports`
// map) and node:crypto is never in its module graph at all.
// Key design decision: NOT `export * from "./index"` -- ./index.ts's own
// header explains why `export *` on a CommonJS-compiled module silently
// drops named bindings under Rollup's CJS->ESM interop. Duplicating the
// explicit list is the accepted cost; the two files carry matching
// "update the other one too" notes at each other's export blocks.
// UPDATE ./index.ts'S EXPORTS? Update this file too, MINUS normalize's.
export type { ErrorCode } from "@brief/shared";
export { AppError } from "@brief/shared";
export type { Result } from "@brief/shared";
export { ok, err } from "@brief/shared";

export type { Clock, IdGenerator } from "@brief/shared";

// `ulid` (the package) is pure JS with no Node-specific API -- safe here.
export { systemClock, ulidGenerator } from "@brief/shared";

export {
  CodeCitationInputSchema,
  CodeCitationSchema,
  KbCitationSchema,
  CitationInputSchema,
  CitationSchema,
} from "@brief/shared";
export type {
  CodeCitationInput,
  CodeCitation,
  KbCitation,
  CitationInput,
  Citation,
  ValidationState,
  CitationValidationResult,
} from "@brief/shared";

// NOT exported here -- see module header: `normalizeContent`/`hashLines`
// pull in `node:crypto`. Node consumers (server, cli) import them from the
// default `.` entry (./index.ts) instead.

export type { Actor, Envelope } from "@brief/shared";
export { UlidSchema, EnvelopeSchema } from "@brief/shared";

export { ActionSchema } from "./actions";
export type { Action, ActionType } from "./actions";

export {
  EventSchema,
  AnswerEventSchema,
  OpenFindingEventSchema,
  ResolveFindingEventSchema,
  KbProposalEventSchema,
  ResolveProposalEventSchema,
  AgentPostableEventSchema,
  SYSTEM_EVENT_TYPES,
} from "./events";
export type { Event, EventType } from "./events";

export { DiagramSpecSchema } from "./diagram";
export type { DiagramSpec } from "./diagram";

export { FocusSchema, SessionSchema } from "./session";
export type { Focus, Session } from "./session";

export type { CitationSlot } from "@brief/shared";
export { walkCitations, collectCitationInputs, mintCodeCitations } from "@brief/shared";

export { isPropertyIdAnchor } from "@brief/shared";

export { githubHeadingSlug, headingSlugsOf } from "@brief/shared";

export type { LanguageTag } from "./language";
export { detectLanguage } from "./language";

export type { ReaderStatus, ReaderState, OrderedEnvelope } from "./reader-state";
export {
  targetPathOfCitation,
  targetBasePath,
  applyReaderStateTransition,
  foldReaderState,
} from "./reader-state";

export type { CoverageEntry, CoverageCounts, CoverageMap } from "./coverage";
export { WORST_STATUS_ORDER, worseStatus, buildCoverageMap } from "./coverage";

export type { OpenQuestion, FindingRecord, ProposalRecord } from "./session-fold";
export { foldOpenQuestions, foldFindings, foldProposals } from "./session-fold";

// v2 (ADR-005): comprehension map + overlay + pedagogy move loop + devices
// -- none of these pull in node:crypto, so (unlike normalize.ts) the FULL
// surface is safe here too. UPDATE ./index.ts'S EXPORTS? Update this file too.
export { countWords, withinWordBudget } from "./word-count";

// Step 2 (kb/plan.md): the three dynamic/composite devices join the two
// step-1 static ones in DeviceSpecSchema's union -- see ./devices.ts.
export {
  ScenarioStripSchema,
  LawCardSchema,
  DeviceSpecSchema,
  ExecutionTraceSchema,
  MemoryGraphSchema,
} from "./devices";
export type {
  ScenarioStrip,
  LawCard,
  DeviceSpec,
  ExecutionTrace,
  StateMachine,
  MemoryGraph,
} from "./devices";

export {
  NodeTypeSchema,
  NodeLevelSchema,
  MapNodeSchema,
  MapUpsertActionSchema,
  checkMapUpsert,
  foldMap,
} from "./comprehension-map";
export type { NodeType, NodeLevel, MapNode, MapUpsertActionPayload } from "./comprehension-map";

export {
  MasteryStateSchema,
  EvidenceKindSchema,
  NodeResponseEventSchema,
  NodesInvalidatedEventSchema,
} from "./overlay";
export type {
  MasteryState,
  EvidenceKind,
  OverlayEvidence,
  OverlayEntry,
  NodeResponsePayload,
  NodesInvalidatedPayload,
} from "./overlay";
export { foldOverlay } from "./overlay-fold";
export { computeFrontier } from "@brief/shared";

export { detectNewlyDemonstrated } from "./laconic-transitions";

export {
  PresentMoveActionSchema,
  MoveResponseEventSchema,
  ModeChangeEventSchema,
  checkMoveBudgets,
  checkDeviceBudgets,
} from "./pedagogy";
export type { PresentMove, MoveResponsePayload as PedagogyMoveResponsePayload } from "./pedagogy";

// Round-7 (ADR-007, kb/spec/interaction-model.md): the choice protocol and
// the talk lifecycle -- pulls in no node:crypto, safe here too (web will
// consume these directly in R7-2/R7-3). UPDATE ./index.ts'S EXPORTS TOO.
export {
  OfferChoicesActionSchema,
  ChoiceMadeEventSchema,
  checkOfferChoicesBudgets,
  checkChoiceMadeShape,
  checkChoiceMadeScope,
} from "./choices";
export type { OfferChoicesPayload, ChoiceMadePayload } from "./choices";

export {
  TalkStartActionSchema,
  TalkSlideActionSchema,
  TalkEndActionSchema,
  TalkAdvanceEventSchema,
  TalkExitEventSchema,
  checkTalkStartBudgets,
  checkTalkSlideBudgets,
  checkTalkSlideSequencing,
  foldTalkState,
} from "./talk";
export type { TalkStartPayload, TalkSlidePayload, TalkEndPayload, TalkState } from "./talk";

// Round-7: the glossary-term parser behind GET /api/glossary (US15).
export { parseGlossary } from "./glossary";
export type { GlossaryTerm } from "./glossary";

// v2 step 4 (ADR-005, kb/spec/pedagogy-engine.md#rupture): the pause-for-
// change lifecycle -- pulls in no node:crypto, safe here too (web derives
// the live "paused" state and renders the change-break proposal from these
// same schemas' payload shapes). UPDATE ./index.ts'S EXPORTS? Update this
// file too.
export {
  ProposeChangeBreakActionSchema,
  ChangeBreakResponseEventSchema,
  PauseForChangeActionSchema,
  ResumeSessionActionSchema,
  checkPauseAuthorized,
} from "./rupture";
export type {
  ProposeChangeBreakPayload,
  ChangeBreakResponsePayload,
  PauseForChangePayload,
  ResumeSessionPayload,
} from "./rupture";

// Step 3 (kb/plan.md): mode inference + the GET /api/file kb-reference
// detector -- neither pulls in node:crypto, so (like the v2 block above)
// the full surface is safe here too.
export {
  EXPLORING_IDLE_MS,
  foldMode,
  shouldReturnToDialogue,
  shouldInferExploring,
} from "./mode-inference";
export type { CurrentMode } from "./mode-inference";

export { detectKbRefs } from "./kb-ref";
export type { KbRefSpan } from "./kb-ref";
