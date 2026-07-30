// Module: api/rounds -- POST /api/rounds, `forebrief post`'s atomic-round
// target (kb/spec/cli-contract.md).
import type { Context } from "hono";
import { AppError, type Clock, type IdGenerator } from "@brief/shared";
import type { CitationRepoAccess, CitationKbAccess, EventStore } from "@brief/core";
import { RoundSubmissionSchema } from "../types/round";
import type { CardValidationReport, StoredRound } from "../types/round";
import { mintAndValidateCard } from "../rounds/mint-and-validate";
import { findOpenRound, writeRoundFile } from "../rounds/store";
import { isCardDecided } from "../records/queries";
import { schemaErrorMessage } from "../schema-error";

export interface RoundsRouteDeps {
  repoRoot: string;
  eventStore: EventStore;
  repo: CitationRepoAccess;
  kb: CitationKbAccess;
  clock: Clock;
  ids: IdGenerator;
}

/** @throws {AppError} E_ROUND_OPEN naming the open round's id and progress. */
async function assertNoOpenRound(deps: RoundsRouteDeps): Promise<void> {
  const open = await findOpenRound(deps.repoRoot, deps.eventStore);
  if (!open) return;
  const envelopes = deps.eventStore.readSince(0);
  const decided = open.cards.filter((card) => isCardDecided(envelopes, card.id)).length;
  throw new AppError(
    "E_ROUND_OPEN",
    `round ${open.id} is still open (${String(decided)}/${String(open.cards.length)} cards decided) -- decide it before posting a new one`,
    { round_id: open.id, cardsDecided: decided, cardsTotal: open.cards.length },
  );
}

export function roundsRoute(deps: RoundsRouteDeps) {
  return async (c: Context): Promise<Response> => {
    const body: unknown = await c.req.json();
    const parsed = RoundSubmissionSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("E_SCHEMA", schemaErrorMessage("malformed round", parsed.error.issues), {
        issues: parsed.error.issues,
      });
    }
    await assertNoOpenRound(deps);

    const roundId = deps.ids.next();
    const postedAt = deps.clock.nowIso();
    const mintDeps = { repo: deps.repo, kb: deps.kb };
    const minted = await Promise.all(
      parsed.data.cards.map((card, i) =>
        mintAndValidateCard(
          card,
          deps.ids.next(),
          roundId,
          postedAt,
          mintDeps,
          `cards[${String(i)}]`,
        ),
      ),
    );

    const round: StoredRound = {
      id: roundId,
      posted_at: postedAt,
      cards: minted.map((m) => m.card),
      ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
    };
    await writeRoundFile(deps.repoRoot, round);

    const report: CardValidationReport[] = minted.map((m) => m.report);
    return c.json(report);
  };
}
