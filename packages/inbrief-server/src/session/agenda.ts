// Module: session/agenda -- what a session INTENDS to teach.
//
// The prerequisite graph says what is POSSIBLE next. It was doing both jobs
// until the pandora checkpoint showed what that costs: a session that made sense
// question by question and had no visible destination, because every eligible
// node was equally eligible and the first one in the log won.
//
// ADR-021 separates them. The graph still constrains, the citations still ground
// it, and an agenda proposed by the agent says which of the possible things this
// session is actually for.
//
// @invariant the graph WINS at runtime. An agenda is a plan; a plan that wants a
//   node whose prerequisite the engineer has just called shaky does not get it.
//   Validation catches the static contradiction; this rule handles the one that
//   appears mid-session, which validation cannot see.
import type { StoredNode } from "../types/node";

/** Why an agenda was refused. */
export type AgendaRefusal =
  "agenda-unknown-node" | "agenda-violates-prerequisites" | "agenda-duplicate";

type GraphNode = Pick<StoredNode, "id" | "requires">;

/**
 * @param agenda the intended order, which may cover only part of the map
 * @param map every node currently known
 * @returns the refusals this agenda earns, empty when it is coherent
 * @invariant a PARTIAL agenda is fine. An agenda is a plan for the part worth
 *   planning, and demanding it name every node would make it a second copy of
 *   the map that has to be maintained alongside it.
 */
export function validateAgenda(
  agenda: readonly string[],
  map: readonly GraphNode[],
): AgendaRefusal[] {
  const refusals: AgendaRefusal[] = [];
  const byId = new Map(map.map((n) => [n.id, n]));

  if (new Set(agenda).size !== agenda.length) refusals.push("agenda-duplicate");
  if (agenda.some((id) => !byId.has(id))) refusals.push("agenda-unknown-node");

  // A node may not be intended before something it requires. This is a bug, not
  // a preference: the session would announce an order it cannot follow, and the
  // engineer would watch an item be skipped with no explanation given.
  const position = new Map(agenda.map((id, i) => [id, i]));
  const outOfOrder = agenda.some((id, i) =>
    (byId.get(id)?.requires ?? []).some((req) => {
      const reqAt = position.get(req);
      return reqAt !== undefined && reqAt > i;
    }),
  );
  if (outOfOrder) refusals.push("agenda-violates-prerequisites");

  return refusals;
}

/** States meaning the engineer has not yet said anything about this node. */
const UNANSWERED: ReadonlySet<string> = new Set(["unseen", "introduced"]);

/**
 * @param agenda the intended order
 * @param fringe what the graph currently permits, in its own order
 * @param mastery what the engineer has said about each node so far
 * @returns the id to teach next, or undefined when nothing is teachable
 * @invariant intersects rather than concatenates. The first agenda item the
 *   fringe currently allows wins; anything the agenda wants but the graph
 *   forbids simply waits its turn rather than being skipped or forced.
 * @invariant an ANSWERED node never wins over an unanswered one. `shaky` keeps a
 *   node in the frontier by design, since being unsure is not being done with
 *   it. Preferring the plan alone then re-offers exactly the node just answered,
 *   forever, and the only remaining control is ending the session. Found in the
 *   first tezqed session with two other nodes teachable and never offered
 *   (ADR-030).
 */
export function nextFromAgenda(
  agenda: readonly string[],
  fringe: readonly string[],
  mastery: Readonly<Record<string, string>> = {},
): string | undefined {
  const teachable = new Set(fringe);
  const unanswered = (id: string): boolean => UNANSWERED.has(mastery[id] ?? "unseen");

  const planned = agenda.find((id) => teachable.has(id) && unanswered(id));
  // Falling back to the fringe is what makes a partial agenda usable: once the
  // planned part is done, the rest of the map is still worth teaching.
  const fresh = planned ?? fringe.find(unanswered);
  if (fresh !== undefined) return fresh;

  // Nothing new is teachable. Re-offering what the engineer was unsure about is
  // right HERE and only here: it is the last thing left, so returning nothing
  // would report a finished session over a node still marked shaky.
  return agenda.find((id) => teachable.has(id)) ?? fringe[0];
}
