// Module: index -- @backbrief/shared's public surface.
//
// architecture/overview.md: "shared <- {server, cli, web}" -- this is the
// only file the other three packages should import from (deep imports like
// `@backbrief/shared/dist/citation` work but bypass this contract and are
// discouraged in code review).
// Key design decision: explicit named re-exports, NOT `export * from`.
// TS compiles `export *` to CommonJS as a runtime loop (`__exportStar`,
// `for (var p in m) ...`) -- invisible to a bundler's static CJS->ESM
// interop analysis (Vite/Rollup can only see what it can find without
// executing the module). A web-side `import { ulidGenerator } from
// "@backbrief/shared"` silently resolved to `undefined` at runtime under
// `export *` (caught building packages/web, not by typecheck: the .d.ts
// files ARE statically analyzable, so `tsc` saw nothing wrong). Explicit
// re-exports compile to a scannable `Object.defineProperty(exports, "name",
// ...)` per binding, which bundlers do recognize.
// Node-only surface: `hashLines`/`normalizeContent` pull in `node:crypto`.
// `web` imports the "./browser" entry (./index.browser.ts) instead, which
// is this same list minus those two -- see that file's header for the Vite
// warning this split fixes. ADDING AN EXPORT HERE? Add it there too.
export type { ErrorCode } from "@brief/shared";
export { AppError } from "@brief/shared";
export type { Result } from "@brief/shared";
export { ok, err } from "@brief/shared";

export type { Clock, IdGenerator } from "@brief/shared";

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

export { normalizeContent, hashLines, hashContext } from "@brief/shared";

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

// v2 (ADR-005): comprehension map + overlay + pedagogy move loop + devices.
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
// the talk lifecycle. UPDATE index.browser.ts TOO.
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
// change lifecycle. UPDATE index.browser.ts TOO.
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

// Step 3 (kb/plan.md): mode inference (interaction-modes watcher) + the
// GET /api/file kb-reference detector. UPDATE index.browser.ts TOO.
export {
  EXPLORING_IDLE_MS,
  foldMode,
  shouldReturnToDialogue,
  shouldInferExploring,
} from "./mode-inference";
export type { CurrentMode } from "./mode-inference";

export { detectKbRefs } from "./kb-ref";
export type { KbRefSpan } from "./kb-ref";
