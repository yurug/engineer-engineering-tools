// Module: rounds/store -- `.forebrief/rounds/<ulid>.json` persistence, open-
// round detection, and P10 re-grounding at read time.
//
// kb/spec/config-and-formats.md#round-file: "the round exactly as ingested
// and minted... immutable after posting." One file holds either an atomic
// round (every card's `round_id` equals the file's own id) or a single
// trickle card (`round_id: null`) -- both are `rounds/<ulid>.json`; the
// distinction lives entirely in the cards' own `round_id`, not a second field.
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { EventStore, CitationRepoAccess, CitationKbAccess } from "@brief/core";
import { validateCodeCitation, validateKbCitation } from "@brief/core";
import { resolveForebriefPath } from "../fsguard";
import { groundClaim, groundReversibility } from "../render/ground";
import { isCardDecided } from "../records/queries";
import type { StoredCard, StoredRound } from "../types/round";

const ROUNDS_DIR = "rounds";

export async function writeRoundFile(repoRoot: string, round: StoredRound): Promise<void> {
  const filePath = resolveForebriefPath(repoRoot, path.posix.join(ROUNDS_DIR, `${round.id}.json`));
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(round, null, 2) + "\n", "utf8");
}

/** @returns every posted round/trickle file, oldest first (filename order -- ULIDs sort chronologically). */
export async function listRoundFiles(repoRoot: string): Promise<StoredRound[]> {
  const dirPath = resolveForebriefPath(repoRoot, ROUNDS_DIR);
  let names: string[];
  try {
    names = (await fs.readdir(dirPath)).filter((n) => n.endsWith(".json")).sort();
  } catch {
    return []; // no rounds posted yet
  }
  const rounds = await Promise.all(
    names.map(
      async (name) =>
        JSON.parse(await fs.readFile(path.join(dirPath, name), "utf8")) as StoredRound,
    ),
  );
  return rounds;
}

/** True for a file posted via the atomic `{cards:[...]}` path -- a trickle card's `round_id` is always null. */
function isAtomicRound(round: StoredRound): boolean {
  return round.cards.length > 0 && round.cards.every((c) => c.round_id === round.id);
}

/**
 * @returns the one atomic round with at least one undecided card, or null
 *   if none is open (algorithms.md: "A round is open until every card has a
 *   record; there is no timeout")
 * @invariant E_ROUND_OPEN's enforcement (api/rounds.ts) guarantees at most
 *   one such round exists at a time
 */
export async function findOpenRound(
  repoRoot: string,
  eventStore: EventStore,
): Promise<StoredRound | null> {
  const envelopes = eventStore.readSince(0);
  const rounds = (await listRoundFiles(repoRoot)).filter(isAtomicRound);
  for (const round of rounds) {
    if (round.cards.some((card) => !isCardDecided(envelopes, card.id))) return round;
  }
  return null;
}

async function regroundConsequence(
  consequence: StoredCard["options"][number]["consequences"][number],
  deps: { repo: CitationRepoAccess; kb: CitationKbAccess },
): Promise<StoredCard["options"][number]["consequences"][number]> {
  if (!consequence.citation) return consequence;
  const result =
    consequence.citation.kind === "code"
      ? await validateCodeCitation(consequence.citation, deps.repo)
      : await validateKbCitation(consequence.citation, deps.kb);
  const citation = result.citation.kind === "code" ? result.citation : consequence.citation;
  return { ...consequence, citation, grounding: groundClaim(citation, result.state) };
}

async function regroundReversibility(
  reversibility: StoredCard["options"][number]["reversibility"],
  deps: { repo: CitationRepoAccess; kb: CitationKbAccess },
): Promise<StoredCard["options"][number]["reversibility"]> {
  if (!reversibility.undo) return reversibility;
  const result =
    reversibility.undo.kind === "code"
      ? await validateCodeCitation(reversibility.undo, deps.repo)
      : await validateKbCitation(reversibility.undo, deps.kb);
  const undo = result.citation.kind === "code" ? result.citation : reversibility.undo;
  return {
    ...reversibility,
    undo,
    grounding: groundReversibility(reversibility.class, undo, result.state),
  };
}

/**
 * @invariant P10: re-validates every citation on `card` fresh (drift-repair
 *   attempted first) rather than trusting the stored grounding -- the only
 *   two callers are `GET /api/state` and `digest` (algorithms.md's
 *   re-validation triggers); raw `events` never calls this.
 */
export async function regroundCard(
  card: StoredCard,
  deps: { repo: CitationRepoAccess; kb: CitationKbAccess },
): Promise<StoredCard> {
  const options = await Promise.all(
    card.options.map(async (option) => ({
      ...option,
      consequences: await Promise.all(option.consequences.map((c) => regroundConsequence(c, deps))),
      reversibility: await regroundReversibility(option.reversibility, deps),
    })),
  );
  // T10 (2026-07-28): a card's visual is frozen at post time while its
  // citations re-validate here. It cannot be re-rendered into truth -- an
  // unchanged spec renders byte-identically -- so the honest move is to say so.
  // Conservative on purpose: a diagram carries no per-node citation references,
  // so ANY broken citation on the card raises the flag.
  const anyBroken = options.some(
    (o) =>
      o.consequences.some((c) => c.citation && c.grounding.kind !== "grounded") ||
      (o.reversibility.undo !== undefined && o.reversibility.grounding.kind !== "grounded"),
  );
  const visual = card.visual && anyBroken ? { ...card.visual, mayBeStale: true } : card.visual;
  return { ...card, options, ...(visual ? { visual } : {}) };
}

// ── Card summaries for derived surfaces ─────────────────────────────────
// kb/conventions/card-copy.md: any surface naming a card must show its
// prompt -- ids are locators, never labels (user feedback, 2026-07-25).
// The provisionals list and the digest join against this index because a
// provisional's card usually belongs to a CLOSED round, which /api/state's
// `round` field (open round only) cannot describe.

export interface CardSummary {
  prompt: string;
  kind: string;
  options: { key: string; label: string }[];
  /** null for a trickle card -- the digest needs this to spot one left undecided. */
  roundId: string | null;
}

/** @returns id -> summary for every card ever posted (all round files; bounded by human decision throughput). */
export async function cardSummaryIndex(repoRoot: string): Promise<Record<string, CardSummary>> {
  const rounds = await listRoundFiles(repoRoot);
  const index: Record<string, CardSummary> = {};
  for (const round of rounds) {
    for (const card of round.cards) {
      index[card.id] = {
        prompt: card.prompt,
        kind: card.kind,
        options: card.options.map((o) => ({ key: o.key, label: o.label })),
        roundId: card.round_id,
      };
    }
  }
  return index;
}
