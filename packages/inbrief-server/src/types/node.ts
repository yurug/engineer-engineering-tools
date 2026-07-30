// Module: types/node -- what a map node is, on the wire and in store.
//
// The shape is the glossary's definition made executable (kb/GLOSSARY.md):
// "one question, one answer of at most thirty words, at least one citation
// that resolves, and exactly one mode". Everything here that looks like a
// policy decision is a KB line, and the comment says which, so a future reader
// can tell an invariant from a preference.
import type { Citation, CitationInput } from "@brief/shared";

/**
 * The two Diataxis modes inbrief teaches.
 *
 * Diataxis has four; the other two (how-to, reference) serve someone already
 * working in a system rather than someone still learning it, and ADR-006 puts
 * them out of scope for a session. Keeping the type to two is what stops a map
 * from quietly becoming a second copy of the project's documentation.
 */
export type NodeMode = "tutorial" | "explanation";

export const NODE_MODES: readonly NodeMode[] = ["tutorial", "explanation"];

/**
 * The answer budget, in words (kb/GLOSSARY.md). P5 makes it the server's job to
 * enforce rather than suggest.
 *
 * Raised from thirty to sixty (ADR-034). Thirty was backbrief's number, adopted
 * for family consistency, and the first tezqed session showed what it costs here:
 * "T1 to T6, each carrying its own grade" fits in thirty words and says nothing,
 * while "two are only tested, three proved on paper, one assumed outright" does
 * not fit and is the actual content. The budget was making naming a thing cheaper
 * than stating it, and the engineer flagged both nodes that failed that way.
 *
 * The cost is a real divergence: inbrief and backbrief now share the question
 * bound and not the answer bound.
 */
export const ANSWER_WORD_BUDGET = 60;

/**
 * The question budget, in words (kb/GLOSSARY.md, decided in round 5).
 *
 * Twelve is backbrief's own bound, adopted rather than derived: its UI has shown
 * that twelve words render on one line, and one number across the family beats
 * two. The card recorded the cost of inheriting it, which is that inbrief asks
 * about a whole system where backbrief asks about a change, and nobody checked
 * whether that needs more words.
 *
 * This existed as a deliberate gap for one commit. Enforcing the answer bound
 * and not this one made P5 half true, which is worse than enforcing neither,
 * because a reader cannot tell which half.
 */
export const QUESTION_WORD_BUDGET = 12;

/**
 * Whether a claim describes how something is DESIGNED or how it currently STANDS.
 *
 * Orthogonal to the mode: both a durable claim and a snapshot can be explanation,
 * so this cannot be derived from what a node already carries. Only durable nodes
 * are proposed back as documentation (ADR-024), because committing a snapshot
 * writes down a state as though it were an intention, and the file does not know
 * when the state changes.
 */
export type Lifetime = "durable" | "snapshot";

/**
 * The default when an author says nothing.
 *
 * `snapshot`, deliberately, and the card that decided this named the reason:
 * a field with a default gets left at its default, and an agent authoring in
 * bulk marks everything the easy way. Defaulting to snapshot means the lazy path
 * produces LESS documentation rather than more, so someone has to mean it before
 * a claim is committed to a project.
 */
export const DEFAULT_LIFETIME: Lifetime = "snapshot";

/** What an agent submits. Carries no rev, no hash, and no verdict: those are the server's. */
export interface NodeSubmission {
  /** Stable slug, chosen by the agent, never reused for a different claim. */
  id: string;
  mode: NodeMode;
  /** The node's label, phrased as a question (kb/GLOSSARY.md: nodes are questions, not topics). */
  question: string;
  /** The claim, at most ANSWER_WORD_BUDGET words. */
  answer: string;
  /** At least one. P1 admits nothing ungrounded. */
  citations: CitationInput[];
  /**
   * Ids of nodes the engineer must hold before this one is offered (ADR-005).
   *
   * Required rather than optional, and empty rather than absent: an optional
   * field makes "no prerequisites" and "nobody thought about prerequisites"
   * the same value, and the fringe computation cannot tell them apart either.
   */
  requires: string[];
  /**
   * The laconic concept this node teaches, when it teaches one that TRAVELS.
   *
   * Set only where the concept is portable across projects (a cognitive-science
   * effect, a protocol, a language feature), never on repo-specific ground.
   * Same shape and same rule as backbrief's `MapNode.portableConcept`, so the
   * two tools name the same thing the same way.
   *
   * This is the only join between a node and the engineer's knowledge model, and
   * therefore the only thing that can be subtracted (P2). A node without one is
   * always taught, because nothing outside this project can vouch for it
   * (ADR-014).
   */
  portableConcept?: { id: string; domain: string };
  /** Design or current state. Absent means `snapshot`: see DEFAULT_LIFETIME. */
  lifetime?: Lifetime;
}

/** A submission after the server has minted its citations. */
export interface StoredNode extends Omit<NodeSubmission, "citations"> {
  citations: Citation[];
}

/** Why a node was refused. Every value is a KB line, not a style preference. */
export type Refusal =
  | "no-citation" // P1
  | "answer-over-budget" // P5 + the glossary's thirty words
  | "question-over-budget" // P5 + the glossary's twelve words (ADR-011)
  | "requires-unknown-node" // ADR-005: waits on something that does not exist
  | "requires-cycle" // ADR-005: waits, transitively, on itself
  | "mode-out-of-scope" // ADR-006
  | "citation-unresolved"; // P1

export interface IntakeResult {
  /** True only when every check passed. A false here never means the node vanished. */
  admitted: boolean;
  /**
   * The node as the server understands it, present whether or not it was
   * admitted. P1 forbids silently dropping a node whose citation failed: the
   * caller renders it visibly unverified, which it cannot do without this.
   */
  node: StoredNode;
  /** One entry per submitted citation, in submission order. */
  verdicts: { state: "valid" | "drifted" | "broken"; reason?: string }[];
  refusals: Refusal[];
}
