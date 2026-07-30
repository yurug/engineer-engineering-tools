// Module: session -- the accumulated state of one onboarding session, derived
// from the event log rather than held in memory.
//
// Everything a session knows is a fold over the log. That is not an
// architectural flourish: a session may span days (kb/domain/prd.md), so a
// process that dies mid-session must lose nothing, and the only way to be sure
// of that is for the process to hold no authoritative state at all.
//
// @invariant P3 -- mastery is the human's. `setMastery` refuses an agent actor
//   rather than ignoring it, because a silent no-op would let a caller believe
//   it had advanced something.
// @invariant P7 -- `close` always names both halves. A statement listing only
//   what was covered is the defect the property exists to prevent.
import { AppError, type EventStore } from "@brief/core";
import { computeFrontier } from "@brief/shared";
import { holds, type KnowledgeModel } from "./knowledge-model";
import { nextFromAgenda } from "./agenda";
import { mapWarnings, type MapWarning } from "../nodes/map-warnings";
import type { StoredNode } from "../types/node";

/**
 * The engineer's own claim about a node (kb/GLOSSARY.md). Only the human moves
 * it, and only ever upward through the on-path states; the off-path ones are
 * their signals, not the agent's verdicts.
 */
export type Mastery =
  "unseen" | "introduced" | "grasped" | "demonstrated" | "shaky" | "contested" | "invalidated";

/**
 * States in which a node is WITHHELD from a proposal until it is fixed (ADR-031).
 *
 * Self-healing on purpose: nothing new is recorded, and revising the node until
 * the engineer answers it again is what makes it proposable. `unseen` is absent
 * deliberately, since nobody looking at a node is not the same as somebody
 * looking at it and telling you it failed.
 */
const FLAGGED: ReadonlySet<string> = new Set(["shaky", "contested", "invalidated"]);

/** Mastery states that count as "this engineer holds it" for coverage purposes. */
const HELD: readonly Mastery[] = ["grasped", "demonstrated"];

export type Actor = "human" | "agent";

/**
 * Where a node came from.
 *
 * The distinction exists for one reason: only what a session LEARNED is worth
 * proposing back. Re-proposing material the project already carries would offer
 * the author their own file as a suggestion.
 */
export type NodeSource = "material" | "session";

/**
 * A question the engineer asked mid-session, to be answered later.
 *
 * The session was one-directional until the first tezqed run: the engineer could
 * claim mastery on a node and say nothing else, so a question they could not ask
 * was a hole in the map the tool never learned about (ADR-030).
 *
 * @invariant asking is FIRE AND FORGET. The engineer types, submits and carries
 *   on; nothing waits for an answer, because the friction of waiting is the
 *   reason the question would not be asked at all.
 */
export interface SessionQuestion {
  /** Log sequence, which is also how an answer refers back to it. */
  seq: number;
  text: string;
  /** The node on screen when it was asked, when there was one. */
  nodeId: string | null;
  /** What became of it, once the agent has decided (ADR-030 leaves the choice open). */
  answered: { by: "node" | "reply" | "gap"; text: string } | null;
}

export interface SessionState {
  nodes: StoredNode[];
  /** The order this session intends to teach in (ADR-021). Empty when none was proposed. */
  agenda: string[];
  /** What the session says it is for, shown before any teaching starts (ADR-022). */
  intent: string | null;
  /** Every node has an entry; a node nobody has touched is `unseen`, never absent. */
  mastery: Record<string, Mastery>;
  /** Ids the project already carried, as against ids this session learned. */
  fromMaterial: string[];
  /** Things worth acting on rather than reading, noticed while teaching. */
  findings: { text: string; citation: unknown }[];
  /** What the engineer asked, in log order, answered or not. */
  questions: SessionQuestion[];
  /** Node ids the agent conceded after the engineer contested them (ADR-035). */
  conceded: string[];
  closed: boolean;
}

/** What P7 requires a session to end with. */
export interface SteerabilityStatement {
  /** Questions the engineer claimed to hold. */
  covered: string[];
  /** Questions the map raised and the session did not settle. Named, never omitted. */
  unknown: string[];
  /**
   * Questions the engineer disputed rather than failed to grasp (ADR-030).
   *
   * Separate from `unknown` deliberately. "I disagree" is a claim about the MAP,
   * and reporting it as something the engineer does not know inverts who was
   * found wanting.
   */
  disputed: string[];
  /** What the engineer asked and nobody has answered (ADR-030). */
  questions: SessionQuestion[];
  /**
   * Questions skipped because the knowledge model already vouches for them.
   *
   * Reported separately rather than folded into `covered`, and never omitted: a
   * short session and a shallow session must not look the same, and the engineer
   * is entitled to see what was skipped on their behalf.
   */
  alreadyHeld: string[];
  /** One line the human reads first. */
  summary: string;
  /**
   * What is weak about this map, told to the engineer at the close.
   *
   * P6 does not say a session without material should be refused; it says the
   * map is weaker and SAYS SO. This is where it says so, and the engineer is
   * entitled to know it before they act on what they were taught.
   */
  mapWarnings: MapWarning[];
  /**
   * Things worth acting on, surfaced at the close.
   *
   * P7 is about honesty at the end, and a session that noticed a defect and said
   * nothing would be withholding the most actionable thing it found.
   */
  findings: { text: string; citation: unknown }[];
}

export class Session {
  /**
   * @param store the session's own append-only log
   * @param model what this engineer already knows, read from laconic. Empty by
   *   default, which yields a full session: the honest behaviour when nothing is
   *   known about the reader.
   */
  constructor(
    private readonly store: EventStore,
    private readonly model: KnowledgeModel = new Map(),
  ) {}

  /**
   * @returns whether the knowledge model already vouches for this node
   * @invariant P3 is not violated by this. laconic's states are built from what
   *   the human DID, recorded by laconic's own tool; nothing here is an agent
   *   deciding the human understands something, and inbrief never writes those
   *   states by hand.
   */
  private alreadyHeld(node: StoredNode): boolean {
    return node.portableConcept !== undefined && holds(this.model, node.portableConcept.id);
  }

  /**
   * @param node a node that already passed intake; this method does not
   *   re-validate, because admitting an unvalidated node is intake's mistake to
   *   prevent and duplicating the check here would let the two drift
   */
  async addNode(node: StoredNode, source: NodeSource = "session"): Promise<void> {
    await this.store.append({
      actor: "agent",
      type: "node_upsert",
      refs: node.citations,
      payload: { node, source },
    });
  }

  /**
   * @param actor who is claiming the change; anything but "human" is refused
   * @throws {AppError} E_FORBIDDEN when an agent tries to move mastery (P3)
   * @invariant this is the only place mastery changes. If a second path
   *   appears, P3 stops being checkable in one spot and starts being a
   *   convention.
   */
  async setMastery(nodeId: string, mastery: Mastery, actor: Actor): Promise<void> {
    if (actor !== "human") {
      throw new AppError(
        "E_FORBIDDEN",
        `P3: mastery is the engineer's to move, not the agent's (node ${nodeId})`,
        { nodeId, actor },
      );
    }
    await this.store.append({
      actor: "human",
      type: "mastery",
      refs: [],
      payload: { node: nodeId, mastery },
    });
  }

  /**
   * Records a question the engineer asked, to be answered later.
   *
   * @param actor anything but "human" is refused, exactly as for mastery
   * @throws {AppError} E_FORBIDDEN when an agent tries to ask on the engineer's
   *   behalf. The terminal holds the agent token and the browser holds the
   *   human's, so an agent-authored question would put words in their mouth and
   *   then answer them (P3).
   * @invariant returns as soon as the log has it. Nothing here answers, looks up
   *   or blocks: the engineer keeps reading while this sits in the log.
   */
  async ask(text: string, nodeId: string | null, actor: Actor): Promise<void> {
    if (actor !== "human") {
      throw new AppError(
        "E_FORBIDDEN",
        "P3: a question is the engineer's to ask, not the agent's",
        {
          actor,
        },
      );
    }
    await this.store.append({
      actor: "human",
      type: "question",
      refs: [],
      payload: { text, node: nodeId },
    });
  }

  /**
   * Records what became of a question.
   *
   * @param by `node` when a node now answers it, `reply` for a plain answer,
   *   `gap` when the honest answer is that nobody knows. The choice is the
   *   agent's per question (ADR-030); the record is what makes it reviewable.
   * @invariant a `node` answer names the node, and that node went through the
   *   citation gate like any other. This is how an answer stays grounded without
   *   a second grounded-claim path existing (P1).
   */
  async answer(seq: number, by: "node" | "reply" | "gap", text: string): Promise<void> {
    await this.store.append({
      actor: "agent",
      type: "answer",
      refs: [],
      payload: { question: seq, by, text },
    });
  }

  /** @returns the session as the log describes it; cheap enough to call per request. */
  state(): SessionState {
    const nodes: StoredNode[] = [];
    const mastery: Record<string, Mastery> = {};
    const fromMaterial = new Set<string>();
    const findings: { text: string; citation: unknown }[] = [];
    const questions: SessionQuestion[] = [];
    const conceded = new Set<string>();
    let agenda: string[] = [];
    let intent: string | null = null;
    let closed = false;

    for (const envelope of this.store.readSince(0)) {
      const payload = envelope.payload as Record<string, unknown>;
      switch (envelope.type) {
        case "node_upsert": {
          const node = payload["node"] as StoredNode;
          // Upsert, not append: an id is a stable claim, so a second posting of
          // the same id replaces it and must not create a twin.
          const at = nodes.findIndex((n) => n.id === node.id);
          if (at === -1) nodes.push(node);
          else nodes[at] = node;
          mastery[node.id] ??= "unseen";
          if (payload["source"] === "material") fromMaterial.add(node.id);
          break;
        }
        case "mastery":
          mastery[String(payload["node"])] = payload["mastery"] as Mastery;
          break;
        case "finding":
          findings.push({ text: String(payload["text"]), citation: envelope.refs[0] });
          break;
        case "concession":
          conceded.add(String(payload["node"]));
          break;
        case "question":
          questions.push({
            seq: envelope.seq,
            text: String(payload["text"]),
            nodeId: typeof payload["node"] === "string" ? payload["node"] : null,
            answered: null,
          });
          break;
        case "answer": {
          // Keyed by the question's own seq, which is the identity the log
          // already gives it. Nothing new to mint, and an answer to a question
          // that never happened is dropped rather than inventing one.
          const asked = questions.find((q) => q.seq === Number(payload["question"]));
          if (asked) {
            asked.answered = {
              by: payload["by"] as "node" | "reply" | "gap",
              text: String(payload["text"]),
            };
          }
          break;
        }
        case "agenda":
          // Last one wins: an agenda is a plan and a session may be re-planned,
          // which the append-only log records rather than overwrites.
          agenda = payload["agenda"] as string[];
          intent = (payload["intent"] as string | null) ?? null;
          break;
        case "close":
          closed = true;
          break;
        default:
          break; // unknown types are tolerated on read: the log outlives this code
      }
    }
    return {
      nodes,
      mastery,
      fromMaterial: [...fromMaterial],
      findings,
      questions,
      conceded: [...conceded],
      agenda,
      intent,
      closed,
    };
  }

  /**
   * @param agenda the intended order; validated by the caller against the graph
   * @param intent what the session is for, in one line, shown before teaching
   * @invariant the agent proposes this, not the human. It is a plan about the
   *   material, not a claim about the engineer, so P3 is not in play.
   */
  async setAgenda(agenda: string[], intent: string): Promise<void> {
    await this.store.append({
      actor: "agent",
      type: "agenda",
      refs: [],
      payload: { agenda, intent },
    });
  }

  /**
   * @returns the node to teach next, or undefined when nothing is teachable
   * @invariant the GRAPH wins over the AGENDA. The agenda picks among what the
   *   fringe allows; it never forces a node whose prerequisites are unmet. That
   *   matters mid-session: saying a prerequisite is shaky must send the session
   *   back to it, plan or no plan.
   */
  next(): string | undefined {
    const { agenda, mastery } = this.state();
    return nextFromAgenda(agenda, this.fringe(), mastery);
  }

  /**
   * @returns the ids of nodes teachable right now: every prerequisite held, and
   *   this one not yet
   * @invariant ADR-005 -- the rule is backbrief's `computeFrontier`, called
   *   here rather than reimplemented. inbrief's mastery record is a map from id
   *   to state; backbrief's takes a list of overlay entries, so the only work
   *   this method does is the shape change. If it ever starts deciding anything
   *   itself, the two tools can disagree about what is teachable while both
   *   claiming to follow one rule.
   */
  fringe(): string[] {
    const { nodes, mastery } = this.state();
    // P2: subtract before computing, not after. A node the engineer already
    // holds must still SATISFY what depends on it, so it is treated as
    // demonstrated rather than removed from the graph; removing it would strand
    // everything downstream behind a prerequisite that no longer exists.
    const held = new Set(nodes.filter((n) => this.alreadyHeld(n)).map((n) => n.id));
    return computeFrontier(
      nodes.map((n) => ({ id: n.id, requires: n.requires })),
      nodes.map((n) => ({
        nodeId: n.id,
        state: held.has(n.id) ? ("demonstrated" as const) : (mastery[n.id] ?? "unseen"),
        evidence: [],
        updatedAt: "",
      })),
    );
  }

  /**
   * @returns the nodes this session learned, which the project does not carry
   * @invariant only these are proposed back. Offering an author their own file
   *   as a suggestion is worse than offering nothing.
   * @invariant a node the engineer FLAGGED is withheld until it is fixed
   *   (ADR-031). `lifetime` asks whether a claim is a design or a moment;
   *   nothing asked whether the node taught anyone. Both nodes flagged in the
   *   first tezqed session had real defects, so the signal was exact.
   */
  learned(): StoredNode[] {
    const { nodes, fromMaterial, mastery } = this.state();
    const carried = new Set(fromMaterial);
    // Durable only (ADR-024). A snapshot committed as documentation records a
    // state as though it were a design, and the file cannot tell when the state
    // changed underneath it.
    return nodes.filter(
      (n) =>
        !carried.has(n.id) && n.lifetime === "durable" && !FLAGGED.has(mastery[n.id] ?? "unseen"),
    );
  }

  /**
   * The agent concedes a claim the engineer contested.
   *
   * @param nodeId the node they were right about
   * @throws {AppError} E_VALIDATION when nobody contested it
   * @invariant a node NOBODY CONTESTED cannot be conceded. Without that, an
   *   agent could manufacture evidence about an engineer by conceding claims
   *   they never disputed, and the store this feeds is the one every subtraction
   *   depends on (ADR-035).
   * @invariant conceding is the AGENT's move, never the engineer's. The engineer
   *   saying they were right is a self-report, which is the exact input laconic
   *   refuses; the agent correcting the node is an observation about what the
   *   engineer did.
   */
  async concede(nodeId: string, actor: Actor): Promise<void> {
    if (actor !== "agent") {
      throw new AppError(
        "E_FORBIDDEN",
        `conceding is the agent's move: the engineer saying they were right is a self-report`,
        { nodeId, actor },
      );
    }
    const { mastery, nodes } = this.state();
    if (!nodes.some((n) => n.id === nodeId)) {
      throw new AppError("E_VALIDATION", `no such node: ${nodeId}`, { nodeId });
    }
    if (mastery[nodeId] !== "contested") {
      throw new AppError(
        "E_VALIDATION",
        `nothing to concede: ${nodeId} was not contested by the engineer`,
        { nodeId, mastery: mastery[nodeId] ?? "unseen" },
      );
    }
    await this.store.append({
      actor: "agent",
      type: "concession",
      refs: [],
      payload: { node: nodeId },
    });
  }

  /**
   * @param text what was noticed, in the agent's words
   * @param citation where it was noticed
   * @invariant a finding is NOT documentation (ADR-025). Something a maintainer
   *   should act on rather than read has no business being committed as though
   *   it described the design.
   */
  async addFinding(text: string, citation: StoredNode["citations"][number]): Promise<void> {
    await this.store.append({
      actor: "agent",
      type: "finding",
      refs: [citation],
      payload: { text },
    });
  }

  /**
   * Ends the session with the statement P7 requires.
   *
   * @returns what the engineer can now do and what remains unknown
   * @invariant the unknown list is derived from the map, not from a tally the
   *   session kept. A session cannot under-report unknowns by forgetting to
   *   count one.
   */
  async close(): Promise<SteerabilityStatement> {
    const { nodes, mastery } = this.state();
    const skipped = nodes.filter((n) => this.alreadyHeld(n));
    const rest = nodes.filter((n) => !this.alreadyHeld(n));
    const covered = rest.filter((n) => HELD.includes(mastery[n.id] ?? "unseen"));
    const unknown = rest.filter((n) => !HELD.includes(mastery[n.id] ?? "unseen"));

    // ADR-030: a claim the engineer disputed is not merely uncovered. Listing it
    // among the unknowns would report a gap in THEM where the session was told
    // there is a gap in the MAP.
    const conceded = new Set(this.state().conceded);
    // A dispute the agent conceded is a different thing from one it did not
    // answer: the first ended with the map being corrected, the second is still
    // open against the engineer's judgement (ADR-035).
    const disputed = rest.filter(
      (n) => (mastery[n.id] ?? "unseen") === "contested" && !conceded.has(n.id),
    );

    const statement: SteerabilityStatement = {
      covered: covered.map((n) => n.question),
      unknown: unknown.map((n) => n.question),
      alreadyHeld: skipped.map((n) => n.question),
      disputed: disputed.map((n) => n.question),
      questions: this.state().questions.filter((q) => !q.answered),
      summary: summarise(covered.length, unknown.length),
      findings: this.state().findings,
      mapWarnings: mapWarnings(nodes, { hasMaterial: this.state().fromMaterial.length > 0 }),
    };
    await this.store.append({
      actor: "agent",
      type: "close",
      refs: [],
      payload: { statement },
    });
    return statement;
  }
}

/**
 * @returns the one line the human reads first
 * @invariant never implies coverage the session did not achieve. A session that
 *   covered nothing says so in the first word, because "0 of 3 covered" reads
 *   as progress at a glance and "nothing" does not.
 */
function summarise(covered: number, unknown: number): string {
  if (covered === 0 && unknown === 0) return "Nothing was mapped, so nothing was covered.";
  if (covered === 0) return `Nothing was covered. ${String(unknown)} question(s) remain open.`;
  if (unknown === 0) return `All ${String(covered)} question(s) in the map were covered.`;
  return `${String(covered)} question(s) covered, ${String(unknown)} still open.`;
}
