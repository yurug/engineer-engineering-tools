// Module: reader-state -- the pure fold from an ordered envelope stream to
// per-target ReaderState (kb/spec/data-model.md#reader-state).
//
// Implements kb/spec/algorithms.md#reader-state-transitions exactly,
// including its "default rule" (an event whose listed source state doesn't
// match the target's current status is STILL accepted and moves it to the
// event's destination -- the diagram's arrows document the common case,
// they do not restrict when a transition fires) and cross-session decay
// (`head_changed`'s `changedPaths` demotes `understood` -> `visited`).
// Key design decision: this module does ZERO I/O -- kb/architecture/
// overview.md's mechanism table places "reader-state fold, coverage" in
// `shared (pure)` specifically so it is unit- and property-testable
// (P6: "fold(events) == incremental state") without a filesystem. The
// caller (server/src/store/reader-state-store.ts) is responsible for
// assembling the cross-session-ordered envelope stream (algorithms.md:
// "sessions ordered by createdAt, events by seq within each") -- this
// module only knows how to fold whatever order it's handed.
import type { Envelope } from "@brief/shared";
import type { Citation } from "@brief/shared";
import { isPropertyIdAnchor } from "@brief/shared";

export type ReaderStatus = "unseen" | "visited" | "questioned" | "understood" | "contested";

export interface ReaderState {
  targetPath: string;
  status: ReaderStatus;
  updatedAt: string;
  sessionId: string;
  /**
   * Set only when `status` is the result of decay (algorithms.md: "the
   * coverage map shows it as 'was understood, changed since'"); cleared by
   * any subsequent non-decay transition. NOT part of data-model.md's
   * original ReaderState shape -- added 2026-07-11 (step 2) once
   * algorithms.md's decay marker and api-contracts.md's coverage response
   * shape (`{targetPath, status, decayedFrom?}`) both required it; see
   * that file's same-commit update.
   */
  decayedFrom?: ReaderStatus;
}

/** One envelope tagged with the session it belongs to -- the cross-session fold's input unit. */
export interface OrderedEnvelope {
  sessionId: string;
  envelope: Envelope;
}

/**
 * @returns the file-level (or `path#ID` property-level) target a citation
 *   names -- data-model.md: "Target granularity MVP: file-level... property
 *   IDs are also valid targets."
 */
export function targetPathOfCitation(citation: Citation): string {
  if (citation.kind === "code") return citation.path;
  return isPropertyIdAnchor(citation.anchor)
    ? `${citation.path}#${citation.anchor}`
    : citation.path;
}

/** Strips a trailing `#ID` so a property-level target can be matched against `changedPaths` (file paths only). */
export function targetBasePath(targetPath: string): string {
  const hashIndex = targetPath.indexOf("#");
  return hashIndex === -1 ? targetPath : targetPath.slice(0, hashIndex);
}

interface NavigationPayload {
  path: string;
  kind: "opened" | "viewed-region";
}
interface QuestionPayload {
  citation?: Citation;
}
interface TargetPayload {
  targetPath: string;
}
interface HeadChangedPayload {
  changedPaths: string[];
}

/**
 * Applies ONE envelope's effect to `states`, per algorithms.md's transition
 * table + default rule. Never mutates its input: returns the SAME map
 * reference when the envelope causes no transition (a cheap, correct no-op
 * signal `ReaderStateStore` uses to skip a disk write), or a fresh `Map`
 * with the changed/added entries when it does.
 * @param states the current per-target state, keyed by targetPath
 * @param input the envelope to fold in, plus which session produced it
 * @invariant P4 only `mark_understood`/`contest` reach "understood"/
 *   "contested" -- and both are auth-gated to the human token upstream
 *   (api/events.ts), not here; this fold trusts its input's actor field
 * @invariant P6 pure and order-sensitive only in the sense a fold must be
 *   (later same-target events win) -- rebuilding from zero and folding
 *   incrementally must always agree (see the property test)
 */
export function applyReaderStateTransition(
  states: Map<string, ReaderState>,
  input: OrderedEnvelope,
): Map<string, ReaderState> {
  const { sessionId, envelope } = input;
  const changes = new Map<string, ReaderState>();
  const propose = (targetPath: string, status: ReaderStatus, decayedFrom?: ReaderStatus): void => {
    changes.set(targetPath, {
      targetPath,
      status,
      updatedAt: envelope.ts,
      sessionId,
      ...(decayedFrom !== undefined ? { decayedFrom } : {}),
    });
  };

  if (envelope.type === "navigation") {
    const payload = envelope.payload as unknown as NavigationPayload;
    // Only "opened" transitions reader state -- "viewed-region" is a finer-
    // grained telemetry signal (2s-debounced viewport dwell) that data-
    // model.md never lists as a reader-state trigger.
    if (payload.kind === "opened") propose(payload.path, "visited");
  } else if (envelope.type === "question") {
    const payload = envelope.payload as unknown as QuestionPayload;
    // A question with no citation has no target to advance (a free-
    // floating question still lands in the open-questions digest section,
    // just not on the coverage map).
    if (payload.citation) propose(targetPathOfCitation(payload.citation), "questioned");
  } else if (envelope.type === "mark_understood") {
    propose((envelope.payload as unknown as TargetPayload).targetPath, "understood");
  } else if (envelope.type === "contest") {
    propose((envelope.payload as unknown as TargetPayload).targetPath, "contested");
  } else if (envelope.type === "head_changed") {
    applyDecay(
      states,
      envelope,
      sessionId,
      propose,
      (envelope.payload as unknown as HeadChangedPayload).changedPaths,
    );
  }
  // Every other type (annotation, impression, answer, findings/proposals,
  // tour/*, session_end, focus_changed, ...) never touches reader state --
  // algorithms.md is explicit that `disagree` annotations in particular do
  // NOT change it (that is `contest`'s job).

  if (changes.size === 0) return states;
  const next = new Map(states);
  for (const [targetPath, state] of changes) next.set(targetPath, state);
  return next;
}

/**
 * Decay: every currently-`understood` target whose base file appears in
 * `changedPaths` demotes to `visited` with `decayedFrom: "understood"` --
 * the ONE transition in this fold whose source state IS restrictive (only
 * fires from `understood`, per algorithms.md's diagram), unlike every other
 * event type's unconditional default rule.
 */
function applyDecay(
  states: Map<string, ReaderState>,
  envelope: Envelope,
  sessionId: string,
  propose: (targetPath: string, status: ReaderStatus, decayedFrom?: ReaderStatus) => void,
  changedPaths: readonly string[],
): void {
  void envelope;
  const changed = new Set(changedPaths);
  for (const state of states.values()) {
    if (state.status === "understood" && changed.has(targetBasePath(state.targetPath))) {
      propose(state.targetPath, "visited", "understood");
    }
  }
}

/**
 * Folds a cross-session-ordered stream to final per-target state.
 * @param orderedEnvelopes sessions ordered by createdAt, events by seq
 *   within each (algorithms.md#reader-state-transitions) -- the caller's
 *   responsibility to order; this function trusts the given order
 * @invariant P6 `foldReaderState(events) === events.reduce(applyReaderStateTransition, new Map())`
 *   by construction -- the property test proves prefix-incremental folding
 *   agrees with a from-zero fold of the whole stream
 */
export function foldReaderState(orderedEnvelopes: readonly OrderedEnvelope[]): ReaderState[] {
  const finalMap = orderedEnvelopes.reduce(
    applyReaderStateTransition,
    new Map<string, ReaderState>(),
  );
  return [...finalMap.values()];
}
