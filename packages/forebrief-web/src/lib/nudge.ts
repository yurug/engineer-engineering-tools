// Module: lib/nudge -- T3's rule (kb/properties/edge-cases.md#T3: "Override
// committed without rationale... One nudge... a second commit proceeds
// bare. Never a hard block.").
import type { DecisionMode } from "./types";

/**
 * @invariant T3: only ever nudges ONCE per card -- `alreadyNudged` is the
 *   caller's own per-card flag (lib/draft-reducer.ts sets it the first time
 *   this returns true), so a second Enter with the same empty rationale
 *   always proceeds to commit.
 */
export function shouldNudge(
  mode: DecisionMode | null,
  rationale: string,
  alreadyNudged: boolean,
): boolean {
  return mode === "override" && rationale.trim().length === 0 && !alreadyNudged;
}
