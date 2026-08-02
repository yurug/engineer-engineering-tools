// Module: lib/types -- the wire shapes the browser reads.
//
// Plain local interfaces, not imports from @inbrief/server. The server's types
// are CommonJS with Node10 resolution; this package is ESM with Bundler
// resolution, and linking them would buy a build problem in exchange for a
// guarantee TypeScript cannot give across that boundary anyway (the wire is
// JSON, so the compiler was never checking it end to end).
//
// The cost is real and worth naming: these can drift from the server's. The
// server's api tests assert the shapes these describe, which is where a drift
// would surface.

/** The two Diataxis modes inbrief teaches (ADR-006). */
export type NodeMode = "tutorial" | "explanation";

export type Mastery =
  "unseen" | "introduced" | "grasped" | "demonstrated" | "shaky" | "contested" | "invalidated";

export interface Citation {
  kind: "code" | "kb";
  path: string;
  startLine?: number;
  endLine?: number;
}

/**
 * How a claim stands right now, recomputed by the server on every read.
 *
 * `conjecture` must render VISIBLY differently from `grounded` (P1). Not as an
 * error: the citation may be right about a file that moved. As "we cannot vouch
 * for this".
 */
export type Grounding =
  | { kind: "grounded"; citation: Citation; excerpt: string[] }
  | { kind: "conjecture"; citation: Citation; reason: string; excerpt: string[] };

export interface GroundedNode {
  id: string;
  mode: NodeMode;
  question: string;
  answer: string;
  visual:
    | { kind: "diagram"; spec: unknown; svg: string }
    | { kind: "filmstrip"; spec: unknown; steps: { caption: string; svg: string }[] }
    | { kind: "invalid"; spec: unknown; error: string };
  introduces?: string[];
  uses?: string[];
  grounding: Grounding[];
}

export interface SessionState {
  nodes: GroundedNode[];
  mastery: Record<string, Mastery>;
  /** Held claims revised since the engineer last set mastery on that node. */
  revised?: string[];
  /**
   * Ids teachable right now: every prerequisite held, this one not yet.
   *
   * Computed by the server, never here. It is the one value a second
   * implementation could get subtly wrong while looking right, and two answers
   * to "what comes next" is worse than either answer alone (ADR-005).
   */
  fringe: string[];
  /** The order the session intends to teach in (ADR-021). Empty when unplanned. */
  agenda: string[];
  /** What the session is for, shown before any teaching (ADR-022). */
  intent: string | null;
  /** The single node to teach now: the agenda's choice among what the graph allows. */
  next: string | null;
  /** What the engineer has asked so far, answered or not. */
  questions: SessionQuestion[];
  /** Ids the project already carried, as against ids this session learned. */
  fromMaterial: string[];
  closed: boolean;
}

/** A question the engineer asked, to be answered later (ADR-030). */
export interface SessionQuestion {
  seq: number;
  text: string;
  nodeId: string | null;
  answered: { by: "node" | "reply" | "gap"; text: string } | null;
}

export interface MapWarning {
  code: string;
  detail: string;
}

export interface SteerabilityStatement {
  covered: string[];
  unknown: string[];
  /**
   * Skipped because the knowledge model already vouched for them.
   *
   * Rendered, never hidden: a short session and a shallow session must not look
   * the same, and an engineer is entitled to see what was decided on their
   * behalf.
   */
  alreadyHeld: string[];
  /** Claims the engineer DISPUTED, kept apart from what they did not grasp. */
  disputed: string[];
  /** What they asked and nobody answered. */
  questions: SessionQuestion[];
  /** Things to act on rather than read, noticed while teaching (ADR-025). */
  findings: { text: string }[];
  /** What is weak about this map. P6 says a weaker map SAYS so (ADR-023). */
  mapWarnings: MapWarning[];
  summary: string;
}
