// Module: api/state -- GET /api/state, the browser/CLI bootstrap route
// (kb/architecture/overview.md: "browser bootstrap: open round, cards,
// records").
//
// @invariant P10: the open round's cards are re-validated and re-grounded
//   fresh on every call (rounds/store.ts's regroundCard) -- never the
//   grounding baked in at post time. `records` (the raw decision log) is
//   returned untouched; only CARD claims carry a grounding verdict.
// Step 3 addition: `repoRoot` is now in the response. The web app has no
// other way to learn which repo it is talking to (the URL carries only a
// host:port + token, kb/spec/cli-contract.md's agent notes) -- T2's local
// buffer key (kb/properties/edge-cases.md#T2: "keyed by repo path + card
// id") needs a stable repo identity that survives a kill + re-serve (new
// tokens, same repo path) into a NEW page/URL. This is not a grounding
// field and carries no citation/verdict -- ADR-002's "server computes
// verdicts" boundary is unaffected.
import type { Context } from "hono";
import type { CitationRepoAccess, CitationKbAccess, EventStore } from "@brief/core";
import { cardSummaryIndex, findOpenRound, regroundCard } from "../rounds/store";
import { isCardDecided } from "../records/queries";
import type { StoredRound } from "../types/round";

export interface StateRouteDeps {
  repoRoot: string;
  eventStore: EventStore;
  repo: CitationRepoAccess;
  kb: CitationKbAccess;
}

export function stateRoute(deps: StateRouteDeps) {
  return async (c: Context): Promise<Response> => {
    const envelopes = deps.eventStore.readSince(0);
    const openRound = await findOpenRound(deps.repoRoot, deps.eventStore);
    const groundedRound: StoredRound | null = openRound
      ? {
          ...openRound,
          cards: await Promise.all(openRound.cards.map((card) => regroundCard(card, deps))),
        }
      : null;
    const cardsTotal = openRound?.cards.length ?? 0;
    const cardsDecided =
      openRound?.cards.filter((card) => isCardDecided(envelopes, card.id)).length ?? 0;

    // cardIndex: prompts/labels for EVERY posted card, open round or not --
    // derived surfaces (the provisionals list) must never show a bare id
    // (kb/conventions/card-copy.md, derived-surfaces rule, 2026-07-25).
    const cardIndex = await cardSummaryIndex(deps.repoRoot);

    return c.json({
      repoRoot: deps.repoRoot,
      roundOpen: openRound !== null,
      cardsDecided,
      cardsTotal,
      round: groundedRound,
      cardIndex,
      records: envelopes,
    });
  };
}
