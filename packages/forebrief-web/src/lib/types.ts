// Module: lib/types -- the browser's own copy of forebrief's wire shapes.
//
// Deliberately NOT imported from @forebrief/server or @brief/shared:
// this package has no dependency on either (vite.config.ts's header) --
// these are plain TS interfaces mirroring kb/spec/data-model.md and
// packages/server/src/types/round.ts across the JSON boundary, kept in
// sync by hand (the same JSON-boundary discipline @backbrief/web's own
// lib/api.ts uses for @brief/shared/browser's Citation/CitationInput).
// No runtime validation lives here -- the server already validated
// (zod `.strict()`) everything this file just gives a shape to.
export type OptionKey = "1" | "2" | "3" | "4";
export type CardKind = "question" | "adr";
export type ReversibilityClass = "reversible" | "costly" | "irreversible";
export type SourceChannel = "ui" | "chat" | "file";
export type DecisionMode = "accepted-default" | "override" | "provisional";
/** kb/spec/data-model.md's reconciliation payload: "confirmed"/"overridden"
 *  are what the browser's own reconciliation UI posts (AwaitingReconciliation
 *  List) against an agent-applied provisional; the other three remain for
 *  chat-history reconciliation of a human override made outside the UI. */
export type ReconciliationMode =
  "confirmed" | "overridden" | "override-confirmed" | "override-withdrawn" | "superseded";

/** kb/architecture/decisions/ADR-002.md: the ONE verdict shape -- server-
 *  assigned, never computed here (this file's job is to NAME the shape). */
export type Grounding = { kind: "grounded"; citation: Citation } | { kind: "conjecture" };

export interface Citation {
  kind: "code" | "kb";
  path: string;
  startLine?: number;
  endLine?: number;
  rev?: string;
  contentHash?: string;
  [key: string]: unknown;
}

export interface StoredConsequence {
  text: string;
  citation?: Citation;
  grounding: Grounding;
}

export interface StoredReversibility {
  class: ReversibilityClass;
  undo?: Citation;
  grounding: Grounding;
}

export interface StoredOption {
  key: OptionKey;
  label: string;
  consequences: StoredConsequence[];
  reversibility: StoredReversibility;
}

/** A card's one optional visual (round-1 decision, `.forebrief/
 *  decisions.jsonl` seq 36/37): rendered server-side at post time
 *  (packages/server/src/rounds/mint-and-validate.ts) -- the browser only
 *  displays the stored SVG/steps, it never renders from a spec. `spec` is
 *  carried for provenance/re-render but this package has no dependency on
 *  @brief/primitives and does not type it further than `unknown`. */
export type StoredVisual =
  | { kind: "diagram"; spec: unknown; svg: string; mayBeStale?: boolean }
  | {
      kind: "filmstrip";
      spec: unknown;
      steps: { caption: string; svg: string }[];
      mayBeStale?: boolean;
    };

export interface StoredCard {
  id: string;
  round_id: string | null;
  posted_at: string;
  kind: CardKind;
  prompt: string;
  context: string;
  options: StoredOption[];
  default: OptionKey;
  visual?: StoredVisual;
}

export interface StoredRound {
  id: string;
  title?: string;
  posted_at: string;
  cards: StoredCard[];
}

/** A core Envelope (kb/spec/data-model.md#the-log-line) -- `payload` is
 *  whichever record-payload shape `type` names; this file doesn't narrow
 *  it further than `Record<string, unknown>`, the same conservative shape
 *  every browser-side reader (lib/records.ts, lib/provisionals.ts) expects. */
export interface Envelope {
  id: string;
  seq: number;
  ts: string;
  actor: "human" | "agent" | "system";
  type: string;
  refs: Citation[];
  payload: Record<string, unknown>;
}

/** One posted card's human-readable identity (packages/server/src/rounds/
 *  store.ts's CardSummary) -- covers cards from CLOSED rounds too, which
 *  `round` cannot; derived surfaces label cards with this, never bare ids
 *  (kb/conventions/card-copy.md, derived-surfaces rule). */
export interface CardSummary {
  prompt: string;
  kind: string;
  options: { key: string; label: string }[];
}

/** GET /api/state's response body (packages/server/src/api/state.ts). */
export interface StateResponse {
  repoRoot: string;
  roundOpen: boolean;
  cardsDecided: number;
  cardsTotal: number;
  round: StoredRound | null;
  cardIndex: Record<string, CardSummary>;
  records: Envelope[];
}

/** POST /api/records' input union (packages/server/src/records/schemas.ts).
 *  Only the kinds the browser can post (kb/spec/data-model.md's UI-postable
 *  set, algorithms.md's ask-context flow) are typed here -- `fold`/
 *  `sit_down` are agent/other-channel concerns this slice never sends. */
export type RecordSubmission =
  | {
      kind: "decision";
      card: string;
      chosen: OptionKey;
      mode: DecisionMode;
      rationale?: string;
      source_channel: SourceChannel;
      dwell_ms?: number;
      decided_at?: string;
    }
  | {
      kind: "counter_proposal";
      card: string;
      text: string;
      rationale?: string;
      source_channel: SourceChannel;
    }
  | {
      kind: "reconciliation";
      card: string;
      final: OptionKey;
      mode: ReconciliationMode;
      rationale?: string;
      source_channel: SourceChannel;
    }
  | { kind: "ask_why"; card: string; text: string }
  | { kind: "ask_context"; card: string; text: string }
  | { kind: "feedback"; card?: string; text: string };
