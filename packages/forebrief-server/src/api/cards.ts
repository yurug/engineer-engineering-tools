// Module: api/cards -- POST /api/cards, `forebrief post`'s trickle-card
// target (kb/spec/cli-contract.md: "one trickle card"; kb/spec/data-model.md:
// "A trickle card is `{ card: CardSubmission }`").
//
// A trickle card is not part of any atomic round -- it never checks or
// triggers E_ROUND_OPEN, and its stored `round_id` is always null.
import type { Context } from "hono";
import { AppError, type Clock, type IdGenerator } from "@brief/shared";
import type { CitationRepoAccess, CitationKbAccess } from "@brief/core";
import { TrickleCardSubmissionSchema } from "../types/round";
import type { StoredRound } from "../types/round";
import { mintAndValidateCard } from "../rounds/mint-and-validate";
import { writeRoundFile } from "../rounds/store";
import { schemaErrorMessage } from "../schema-error";

export interface CardsRouteDeps {
  repoRoot: string;
  repo: CitationRepoAccess;
  kb: CitationKbAccess;
  clock: Clock;
  ids: IdGenerator;
}

export function cardsRoute(deps: CardsRouteDeps) {
  return async (c: Context): Promise<Response> => {
    const body: unknown = await c.req.json();
    const parsed = TrickleCardSubmissionSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(
        "E_SCHEMA",
        schemaErrorMessage("malformed trickle card", parsed.error.issues),
        { issues: parsed.error.issues },
      );
    }
    const fileId = deps.ids.next();
    const postedAt = deps.clock.nowIso();
    const { card, report } = await mintAndValidateCard(
      parsed.data.card,
      deps.ids.next(),
      null,
      postedAt,
      {
        repo: deps.repo,
        kb: deps.kb,
      },
    );
    const round: StoredRound = { id: fileId, posted_at: postedAt, cards: [card] };
    await writeRoundFile(deps.repoRoot, round);
    return c.json([report]);
  };
}
