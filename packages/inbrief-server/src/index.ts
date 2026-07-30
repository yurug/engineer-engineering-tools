// Module: index -- @inbrief/server's public surface.
//
// Deliberately narrow. The CLI needs to start a server and nothing else; the
// tests reach for the pieces they exercise. Everything not listed here is an
// implementation detail, and keeping the list short is what lets the internals
// move without breaking a consumer.
export { startServer, type StartServerOptions, type ServerHandle } from "./server";
export { buildApp, type AppDeps } from "./app";
export {
  Session,
  type Mastery,
  type SessionState,
  type SteerabilityStatement,
} from "./session/session";
export { intakeNode } from "./nodes/intake";
export { validateRequires } from "./nodes/requires";
export { validateAgenda, nextFromAgenda, type AgendaRefusal } from "./session/agenda";
export { readMaterial } from "./material/read";
export { readProjectConfig, DEFAULT_MATERIAL_DIR, type ProjectConfig } from "./material/config";
export { proposeMaterial, type Proposal } from "./material/propose";
export { mapWarnings, type MapWarning } from "./nodes/map-warnings";
export { readKnowledgeModel, holds, type KnowledgeModel } from "./session/knowledge-model";
export { writeBackDemonstrated, discoverRecordCmd, type WriteBackDeps } from "./session/write-back";
export { makeRepoAccess, makeKbAccess } from "./repo-access";
export { resolveInbriefPath, isUnderInbrief } from "./fsguard";
export {
  ANSWER_WORD_BUDGET,
  QUESTION_WORD_BUDGET,
  NODE_MODES,
  type IntakeResult,
  type NodeMode,
  type NodeSubmission,
  type Refusal,
  type StoredNode,
} from "./types/node";
