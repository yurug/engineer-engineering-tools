// Module: nodes/map-warnings -- what is wrong with a map that is not wrong with
// any node in it.
//
// Every other check in this server looks at one node. The pandora checkpoint
// failed on something none of them could see: all nine nodes declared the same
// mode, every individual check passed, and the map had no action in it. The
// engineer's complaint, that it felt like implementation detail, was that
// property showing through.
//
// @invariant ADR-023 -- these WARN the agent and never block the human. An
//   imbalanced map is an authoring signal, not an invalid one, and the agent is
//   the author. A rule that refused would encode a heuristic about good maps, on
//   evidence from one session, as a hard constraint.
import { NODE_MODES, type StoredNode } from "../types/node";

export interface MapWarning {
  /** Stable, machine-readable, so an agent can branch on it. */
  code: "single-mode" | "nothing-durable" | "no-material" | "prerequisite-not-durable";
  /** One sentence a human can also read, since warnings surface in the session. */
  detail: string;
}

export interface MapContext {
  /** Whether the project carried teaching material of its own. */
  hasMaterial: boolean;
}

/**
 * @param map every node currently admitted
 * @param context facts about the session that are not properties of any node
 * @returns warnings, empty when there is nothing to say
 * @invariant silent on an empty map. There is nothing to observe about a session
 *   that has not started, and warning there would train an agent to ignore this.
 */
export function mapWarnings(map: readonly StoredNode[], context: MapContext): MapWarning[] {
  if (map.length === 0) return [];
  const warnings: MapWarning[] = [];

  // One mode across a map of several. Skipped for a single node, because every
  // map of one uses one mode and flagging that is noise on the first post.
  const used = new Set(map.map((n) => n.mode));
  if (map.length > 1 && used.size === 1) {
    const missing = NODE_MODES.filter((m) => !used.has(m));
    warnings.push({
      code: "single-mode",
      detail:
        `Every node is ${[...used][0]}. Nothing in this map is ${missing.join(" or ")}, ` +
        `so it informs cognition without informing action, which reads as detail without purpose.`,
    });
  }

  // Nothing durable means nothing will ever be proposed back, so the session
  // teaches and the project learns nothing (ADR-024).
  if (!map.some((n) => n.lifetime === "durable")) {
    warnings.push({
      code: "nothing-durable",
      detail:
        "No node is marked durable, so nothing from this session can be proposed as " +
        "documentation and the project will carry none of it next time.",
    });
  }

  // Only durable nodes are proposed (ADR-024), so a durable node whose
  // prerequisite is a snapshot commits a file whose `requires` names something
  // the project does not carry. It is then refused on the way back in, forever.
  // Found by the first real round trip, where one such node was unloadable no
  // matter what order the reader used (ADR-032).
  const lifetimeById = new Map(map.map((n) => [n.id, n.lifetime ?? "snapshot"]));
  const broken = map
    .filter((n) => n.lifetime === "durable")
    .flatMap((n) =>
      n.requires
        .filter((r) => lifetimeById.get(r) === "snapshot")
        .map((r) => `${n.id} requires ${r}`),
    );
  if (broken.length > 0) {
    warnings.push({
      code: "prerequisite-not-durable",
      detail:
        `Only durable nodes are proposed, so these will be committed with a prerequisite ` +
        `the project does not carry and will never load back: ${broken.join(", ")}.`,
    });
  }

  // P6 does not say refuse; it says the map is weaker and SAYS SO. This is the
  // saying-so, and it is addressed to the engineer as much as to the agent.
  if (!context.hasMaterial) {
    warnings.push({
      code: "no-material",
      detail:
        "This project carries no teaching material, so the map was built from code, tests " +
        "and history alone. It is weaker than one built on material an author wrote.",
    });
  }

  return warnings;
}
