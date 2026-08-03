// Module: app -- the HTTP surface. Four routes and nothing else in step 1.
//
// @invariant P3 -- the mastery route reads the actor from the AUTHENTICATED
//   CONTEXT, never from the request body. This is the single most important line
//   in the file: a route that believed a body field would pass every unit test
//   of Session and hand the agent the human's only privilege.
// @invariant P4 -- nothing here writes. Writes go through the event store, whose
//   path came from fsguard.
import { Hono } from "hono";
import {
  authMiddleware,
  makeErrorResponder,
  type CitationKbAccess,
  type CitationRepoAccess,
  type HttpStatus,
  type PresenceSink,
  type EventStore,
  type Tokens,
  followEventsRoute,
} from "@brief/core";
import { AppError } from "@brief/shared";
import { intakeNode } from "./nodes/intake";
import { regroundNode } from "./nodes/reground";
import { validateAgenda } from "./session/agenda";
import { mapWarnings } from "./nodes/map-warnings";
import { proposeMaterial } from "./material/propose";
import { makeCitationMinter, validateCodeCitation } from "@brief/core";
import type { Citation, CitationInput } from "@brief/shared";
import { Session, type Mastery } from "./session/session";
import type { NodeSubmission, StoredNode } from "./types/node";

/** Step 1 tracks no presence; core's middleware requires a sink, so this is the no-op. */
export const NO_OP_PRESENCE: PresenceSink = { markSeen: () => undefined };

/**
 * Hono's per-request variables, declared so `c.get("actor")` is TYPED rather than
 * cast at each use. Casting worked and was worse: a cast at the call site is a
 * claim, and this is the one value in the app whose correctness is P3.
 */
type Env = { Variables: { actor: "agent" | "human" } };

export interface AppDeps {
  tokens: Tokens;
  session: Session;
  eventStore: EventStore;
  repo: CitationRepoAccess;
  kb: CitationKbAccess;
  /**
   * Where this project keeps material, repository relative (ADR-029).
   *
   * Carried here so a proposal's path is the same path the reader used at
   * startup. Two sources for one directory is how a session proposes into a
   * folder it will not read back.
   */
  materialDir: string;
  /**
   * Records a conceded contest into the engineer's knowledge model (ADR-035).
   *
   * Injected rather than imported so a test never shells out, and null when no
   * laconic tool was found, in which case the loop still works and simply does
   * not compound.
   */
  writeBack?: (node: StoredNode) => Promise<boolean>;
  /** Schedules process shutdown. Called AFTER the response, never during it. */
  onStop: () => void;
}

/**
 * inbrief's own mapping from its error codes to HTTP status. Core stays agnostic
 * to any one consumer's code set, so this is where the choice lives.
 *
 * E_FORBIDDEN is 403 rather than 401: the caller authenticated fine and is not
 * allowed to do this. Reporting 401 would tell the agent to fix its token, when
 * the answer is that no token lets an agent move mastery (P3).
 */
const STATUS_BY_CODE: Record<string, HttpStatus> = {
  E_AUTH: 401,
  E_FORBIDDEN: 403,
  E_VALIDATION: 400,
  E_INTERNAL: 500,
};

/**
 * @returns the minted citation, or null when it does not resolve
 * @invariant a finding whose citation is broken is REFUSED rather than recorded
 *   ungrounded. An unverifiable defect report is worse than none: it sends a
 *   maintainer looking for something that may never have been there.
 */
async function mintFindingCitation(
  input: CitationInput,
  repo: CitationRepoAccess,
): Promise<Citation | null> {
  if (input.kind !== "code") return null;
  const minted = await makeCitationMinter(repo)(input);
  const result = await validateCodeCitation(minted as Extract<Citation, { kind: "code" }>, repo);
  return result.state === "broken" ? null : result.citation;
}

export function buildApp(deps: AppDeps): Hono<Env> {
  const app = new Hono<Env>();
  app.onError(makeErrorResponder(STATUS_BY_CODE));
  app.use("/api/*", authMiddleware(deps.tokens, NO_OP_PRESENCE));

  app.get("/api/events", (c) => {
    const raw = Number(c.req.query("since") ?? "0");
    const since = Number.isFinite(raw) && raw >= 0 ? raw : 0;
    const envelopes = deps.eventStore.readSince(since);
    return c.text(
      envelopes.map((envelope) => JSON.stringify(envelope)).join("\n") +
        (envelopes.length > 0 ? "\n" : ""),
      200,
      { "Content-Type": "application/x-ndjson" },
    );
  });
  app.get(
    "/api/events/follow",
    followEventsRoute({ eventStore: deps.eventStore, presence: NO_OP_PRESENCE }),
  );

  /**
   * The agent proposes a node. Round 1 put the reading on the agent and the
   * judging here, so this route is where "the citations constrain the agent"
   * actually happens.
   *
   * 422 rather than 400 on refusal: the request was well formed and the server
   * understood it, and it declined. A 400 would say the agent malformed
   * something, which sends it to fix the wrong thing.
   */
  app.post("/api/nodes", async (c) => {
    const body = await c.req.json<{ node?: NodeSubmission }>();
    if (!body.node) throw new AppError("E_VALIDATION", "body must carry a `node`");
    // The map is passed in because a prerequisite check cannot be made against
    // one node in isolation: a cycle is a property of the graph, not the node.
    const result = await intakeNode(body.node, deps.repo, deps.session.state().nodes);
    if (!result.admitted) {
      return c.json({ admitted: false, refusals: result.refusals, verdicts: result.verdicts }, 422);
    }
    await deps.session.addNode(result.node);
    // Warnings about the map as a whole ride back on the response that changed
    // it (ADR-023): the agent is the author and this is the moment it can act.
    // They never block, and the node is already admitted by the time they appear.
    const warnings = mapWarnings(deps.session.state().nodes, {
      hasMaterial: deps.session.state().fromMaterial.length > 0,
    });
    return c.json({ admitted: true, node: result.node, warnings });
  });

  /**
   * The human claims mastery. The actor comes from the token via core's
   * middleware; any `actor` in the body is ignored, not consulted.
   */
  app.post("/api/mastery", async (c) => {
    const actor = c.get("actor");
    const body = await c.req.json<{ node?: string; mastery?: Mastery }>();
    if (!body.node || !body.mastery) {
      throw new AppError("E_VALIDATION", "body must carry `node` and `mastery`");
    }
    await deps.session.setMastery(body.node, body.mastery, actor);
    return c.json({ ok: true });
  });

  /**
   * The engineer asks; nobody answers now (ADR-030).
   *
   * Human-only for the same reason mastery is: the CLI holds the agent token, so
   * an agent could otherwise ask a question in the engineer's name and answer it
   * (P3). Returns as soon as the log has it, because a box that makes you wait
   * is a box you stop using.
   */
  app.post("/api/questions", async (c) => {
    const actor = c.get("actor");
    const body = await c.req.json<{ text?: string; node?: string | null }>();
    if (!body.text || body.text.trim() === "") {
      throw new AppError("E_VALIDATION", "body must carry a non-empty `text`");
    }
    await deps.session.ask(body.text, body.node ?? null, actor);
    return c.json({ ok: true });
  });

  /**
   * The agent says what became of a question: a node now answers it, a plain
   * reply, or an honest gap. Agent-only, being the mirror of the route above.
   */
  app.post("/api/answers", async (c) => {
    const body = await c.req.json<{ question?: number; by?: string; text?: string }>();
    const by = body.by;
    if (typeof body.question !== "number" || !body.text || !by) {
      throw new AppError("E_VALIDATION", "body must carry `question`, `by` and `text`");
    }
    if (by !== "node" && by !== "reply" && by !== "gap") {
      throw new AppError("E_VALIDATION", "`by` must be one of: node, reply, gap");
    }
    await deps.session.answer(body.question, by, body.text);
    return c.json({ ok: true });
  });

  /**
   * The agent concedes a claim the engineer contested (ADR-035).
   *
   * Agent-only, and it is the mirror of every other P3 boundary here: the
   * engineer contests, the agent concedes, and neither can do the other's half.
   * An engineer who could concede their own contest would be writing self-report
   * into the shared knowledge store, which is what laconic exists to refuse.
   *
   * The write-back is fired AFTER the record lands and its result is reported,
   * never awaited as a condition: a missing laconic tool means the session did
   * not compound, which is smaller than failing the concession.
   */
  app.post("/api/concessions", async (c) => {
    const body = await c.req.json<{ node?: string }>();
    if (!body.node) throw new AppError("E_VALIDATION", "body must carry a `node`");
    await deps.session.concede(body.node, c.get("actor"));
    const node = deps.session.state().nodes.find((n) => n.id === body.node);
    const compounded = node && deps.writeBack ? await deps.writeBack(node) : false;
    return c.json({ ok: true, compounded });
  });

  /**
   * The browser's bootstrap: the whole session, derived from the log, with every
   * citation re-validated now rather than trusted from intake.
   *
   * P1's "at render time" lives here. Serving the stored verdict would be faster
   * and would tell the reader a node is grounded when its cited lines were
   * rewritten an hour ago.
   */
  /**
   * The agent proposes what this session is FOR and in what order (ADR-021).
   *
   * Refused rather than accepted-and-ignored when it contradicts the graph: an
   * agenda naming a node before its prerequisite would announce an order the
   * session cannot follow, and the engineer would watch an item be skipped with
   * nothing to explain it.
   */
  app.post("/api/agenda", async (c) => {
    const body = await c.req.json<{ agenda?: string[]; intent?: string }>();
    if (!body.agenda || typeof body.intent !== "string") {
      throw new AppError("E_VALIDATION", "body must carry `agenda` and `intent`");
    }
    const refusals = validateAgenda(body.agenda, deps.session.state().nodes);
    if (refusals.length > 0) return c.json({ accepted: false, refusals }, 422);
    await deps.session.setAgenda(body.agenda, body.intent);
    return c.json({ accepted: true });
  });

  app.get("/api/state", async (c) => {
    const state = deps.session.state();
    const nodes = await Promise.all(
      state.nodes.map((node) => regroundNode(node, { repo: deps.repo, kb: deps.kb })),
    );
    // The fringe travels with the state rather than being derived in the
    // browser: it is the one thing a second implementation could get subtly
    // wrong while looking right (ADR-005).
    return c.json({
      ...state,
      nodes,
      fringe: deps.session.fringe(),
      next: deps.session.next() ?? null,
    });
  });

  /** P7: closing is a request, because the human ends the session (ADR-003). */
  app.post("/api/close", async (c) => c.json(await deps.session.close()));

  /**
   * Something worth acting on rather than reading (ADR-025).
   *
   * Separate from a node on purpose: committing a defect as documentation writes
   * a state down as though it were a design.
   */
  app.post("/api/findings", async (c) => {
    const body = await c.req.json<{ text?: string; citation?: CitationInput }>();
    if (!body.text || !body.citation) {
      throw new AppError("E_VALIDATION", "body must carry `text` and `citation`");
    }
    // P1 applies to a finding exactly as to a node: it is a claim about the
    // project, so it points at something real or it is not recorded. Minting
    // here rather than trusting the submission is the same rule as intake, and
    // the event store refuses an unminted citation anyway.
    const minted = await mintFindingCitation(body.citation, deps.repo);
    if (!minted) {
      return c.json({ recorded: false, reason: "citation does not resolve" }, 422);
    }
    await deps.session.addFinding(body.text, minted);
    return c.json({ recorded: true });
  });

  /**
   * What this session learned, rendered as the files a project would keep.
   *
   * @invariant P4 -- returns content, writes nothing. The agent decides what
   *   becomes a file and commits it where the engineer can review a diff.
   */
  app.get("/api/proposals", (c) =>
    c.json({ proposals: proposeMaterial(deps.session.learned(), deps.materialDir) }),
  );

  /**
   * Shuts the server down. NOT the same as closing the session: `close` produces
   * the steerability statement and is the engineer's act, this only ends the
   * process. Conflating them would let a stray `stop` fabricate a closing
   * statement nobody asked for.
   *
   * The shutdown is scheduled rather than awaited, so this response actually
   * reaches the caller instead of dying with the socket it travelled on.
   */
  app.post("/api/stop", (c) => {
    setTimeout(() => deps.onStop(), 0);
    return c.json({ ok: true });
  });

  return app;
}
