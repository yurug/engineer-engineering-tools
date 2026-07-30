// Module: digest -- markdown digest generation, `forebrief digest`'s
// content (kb/spec/cli-contract.md: "recent records, open provisionals,
// pending ask-contexts, fold-in status").
//
// @invariant P10: the only citations a record payload can carry are an
//   `answer`'s (data-model.md); this module re-validates those fresh on
//   every call (never trusting what was minted at `act` time) and marks a
//   now-broken one "stale citation" -- the digest's own re-validation
//   trigger (algorithms.md: "Grounding verdicts are recomputed on... digest").
// @invariant ADR-003/T9: every decision/reconciliation line shows its
//   `source_channel` (card-copy.md: self-contained, no session shorthand)
//   so retroactive logging is visible, never laundered.
import type { Citation, Envelope } from "@brief/shared";
import type { CitationRepoAccess, CitationKbAccess } from "@brief/core";
import { validateCodeCitation, validateKbCitation } from "@brief/core";
import { ofType, payloadOf, reconciliationsForCard } from "./records/queries";
import { cardSummaryIndex, type CardSummary } from "./rounds/store";

const RECENT_RECORDS_LIMIT = 20;

export interface DigestDeps {
  repoRoot: string;
  repo: CitationRepoAccess;
  kb: CitationKbAccess;
}

/** @returns the `seq` of every `answer` envelope with at least one now-broken citation. */
async function findStaleAnswers(
  envelopes: readonly Envelope[],
  deps: DigestDeps,
): Promise<Set<number>> {
  const stale = new Set<number>();
  for (const answer of ofType(envelopes, "answer")) {
    const citations = (payloadOf(answer)["citations"] as Citation[] | undefined) ?? [];
    for (const citation of citations) {
      const result =
        citation.kind === "code"
          ? await validateCodeCitation(citation, deps.repo)
          : await validateKbCitation(citation, deps.kb);
      if (result.state === "broken") {
        stale.add(answer.seq);
        break;
      }
    }
  }
  return stale;
}

async function recentRecordsSection(
  envelopes: readonly Envelope[],
  deps: DigestDeps,
): Promise<string> {
  const recent = envelopes.slice(-RECENT_RECORDS_LIMIT);
  if (recent.length === 0) return "## Recent records\n\n(none yet)\n";
  const staleAnswers = await findStaleAnswers(recent, deps);
  const lines = recent.map((e) => `- [seq ${String(e.seq)}] ${describeRecord(e, staleAnswers)}`);
  return `## Recent records\n\n${lines.join("\n")}\n`;
}

function describeRecord(e: Envelope, staleAnswers: ReadonlySet<number>): string {
  const p = payloadOf(e);
  const retro = typeof p["decided_at"] === "string" ? " (logged retroactively)" : "";
  switch (e.type) {
    case "decision": {
      // A cardless decision (ADR-009) names its own question; a carded one is
      // located by its card id, as every other record is.
      const subject =
        typeof p["card"] === "string" ? `card=${p["card"]}` : `"${String(p["prompt"])}" (no card)`;
      return `**decision** ${subject} chose=${String(p["chosen"])} mode=${String(p["mode"])} via ${String(p["source_channel"])}${retro}`;
    }
    case "reconciliation":
      return `**reconciliation** card=${String(p["card"])} final=${String(p["final"])} mode=${String(p["mode"])} via ${String(p["source_channel"])}${p["late"] === true ? " (late)" : ""}`;
    case "ask_why":
      return `**ask_why** card=${String(p["card"])}: ${String(p["text"])}`;
    case "ask_context":
      return `**ask_context** card=${String(p["card"])}: ${String(p["text"])}`;
    case "answer":
      return `**answer** card=${String(p["card"])} (re: seq ${String(p["ref_seq"])}): ${String(p["text"])}${staleAnswers.has(e.seq) ? " [stale citation]" : ""}`;
    case "counter_proposal":
      return `**counter_proposal** card=${String(p["card"])}: ${String(p["text"])}`;
    case "feedback": {
      const card = typeof p["card"] === "string" ? p["card"] : undefined;
      return `**feedback**${card ? ` card=${card}` : ""}: ${String(p["text"])}`;
    }
    case "sit_down":
      return `**sit_down** ${p["open"] === true ? "opened" : "closed"}`;
    case "fold":
      return `**fold** commit=${String(p["commit"])} files=${String((p["files"] as string[] | undefined)?.length ?? 0)}`;
    default:
      return `**${e.type}**`;
  }
}

// card-copy.md's derived-surfaces rule (user feedback, 2026-07-25): a line
// naming a card shows its PROMPT and the applied option's LABEL; the id/seq
// are trailing locators for `forebrief act` reconciliation, never the label.
function openProvisionalsSection(
  envelopes: readonly Envelope[],
  cards: Record<string, CardSummary>,
): string {
  const provisional = ofType(envelopes, "decision").filter(
    (e) => payloadOf(e)["mode"] === "provisional",
  );
  const open = provisional.filter((decision) => {
    const card = payloadOf(decision)["card"];
    return typeof card === "string" && !reconciliationsForCard(envelopes, card).length;
  });
  if (open.length === 0) return "## Open provisional decisions\n\n(none)\n";
  const lines = open.map((e) => {
    const p = payloadOf(e);
    const cardId = String(p["card"]);
    const summary = cards[cardId];
    const chosen = String(p["chosen"]);
    const label = summary?.options.find((o) => o.key === chosen)?.label;
    const applied = label ? `applied "${label}"` : `applied option ${chosen}`;
    const heading = summary ? `"${summary.prompt}"` : `card ${cardId}`;
    return `- ${heading} — ${applied}, awaiting reconciliation (seq ${String(e.seq)})`;
  });
  return `## Open provisional decisions\n\n${lines.join("\n")}\n`;
}

// A counter-proposal is open until the card it rejects gets decided or the
// agent posts a revised card. The agent's next move is to STUDY it, so the
// digest names it as work, not as commentary (2026-07-27).
function openCounterProposalsSection(
  envelopes: readonly Envelope[],
  cards: Record<string, CardSummary>,
): string {
  const proposals = ofType(envelopes, "counter_proposal");
  const open = proposals.filter((proposal) => {
    const card = payloadOf(proposal)["card"];
    if (typeof card !== "string") return false;
    return !ofType(envelopes, "decision").some((d) => payloadOf(d)["card"] === card);
  });
  if (open.length === 0) return "## Counter-proposals to study\n\n(none)\n";
  const lines = open.map((e) => {
    const p = payloadOf(e);
    const cardId = String(p["card"]);
    const summary = cards[cardId];
    const heading = summary ? `"${summary.prompt}"` : `card ${cardId}`;
    const why = typeof p["rationale"] === "string" ? ` — because ${String(p["rationale"])}` : "";
    return `- ${heading} — none of the options fit; study instead: ${String(p["text"])}${why} (seq ${String(e.seq)})`;
  });
  return `## Counter-proposals to study\n\n${lines.join("\n")}\n`;
}

/**
 * A trickle card with no decision record reaches NO human surface.
 * `GET /api/state` reports only the open atomic round, deliberately (pinned by
 * rounds-api.test.ts), and the awaiting-reconciliation list is keyed on an
 * applied provisional. So an undecided trickle card is accepted, stored,
 * citation-minted, and then invisible.
 *
 * That is not a rendering gap to close. The trickle lifecycle
 * (algorithms.md's provisional flow) has the AGENT apply the card's default
 * provisionally, which decides it and puts it in front of the human as a
 * reconciliation. The failure mode is the agent skipping that step, so the
 * warning belongs on the agent's own surface rather than in the browser. Found
 * posting inbrief's revised Q5 cards, 2026-07-27: two cards posted, grounded,
 * exit code 0, and unreachable by anyone.
 */
function undecidedTrickleSection(
  envelopes: readonly Envelope[],
  cards: Record<string, CardSummary>,
): string {
  const decided = new Set(
    ofType(envelopes, "decision")
      .map((e) => payloadOf(e)["card"])
      .filter((card): card is string => typeof card === "string"),
  );
  const stranded = Object.entries(cards).filter(
    ([id, summary]) => summary.roundId === null && !decided.has(id),
  );
  if (stranded.length === 0) return "## Trickle cards with no decision\n\n(none)\n";
  const lines = stranded.map(
    ([id, summary]) =>
      `- "${summary.prompt}" — no decision recorded, so this card reaches no human surface. ` +
      `Apply its default provisionally (a \`decision\` with mode "provisional" and applied_state) ` +
      `so it shows as awaiting reconciliation, or post it inside a round instead (card ${id})`,
  );
  return `## Trickle cards with no decision\n\n${lines.join("\n")}\n`;
}

function pendingAskContextsSection(envelopes: readonly Envelope[]): string {
  const asks = ofType(envelopes, "ask_context");
  const pending = asks.filter((ask) => !hasAnswer(envelopes, ask.seq));
  if (pending.length === 0) return "## Pending ask-contexts\n\n(none)\n";
  const lines = pending.map(
    (e) =>
      `- card=${String(payloadOf(e)["card"])} (seq ${String(e.seq)}): ${String(payloadOf(e)["text"])}`,
  );
  return `## Pending ask-contexts\n\n${lines.join("\n")}\n`;
}

function hasAnswer(envelopes: readonly Envelope[], askSeq: number): boolean {
  return ofType(envelopes, "answer").some((a) => payloadOf(a)["ref_seq"] === askSeq);
}

function foldStatusSection(envelopes: readonly Envelope[]): string {
  const folds = ofType(envelopes, "fold");
  if (folds.length === 0) return "## Fold-in status\n\nNo rounds folded yet.\n";
  const lines = folds.map(
    (e) =>
      `- commit ${String(payloadOf(e)["commit"])}: ${String((payloadOf(e)["files"] as string[]).join(", "))}`,
  );
  return `## Fold-in status\n\n${lines.join("\n")}\n`;
}

/** @returns the full markdown digest (kb/spec/cli-contract.md's `digest` output). */
export async function renderDigest(
  envelopes: readonly Envelope[],
  deps: DigestDeps,
): Promise<string> {
  const cards = await cardSummaryIndex(deps.repoRoot);
  return [
    "# forebrief digest",
    "",
    await recentRecordsSection(envelopes, deps),
    openProvisionalsSection(envelopes, cards),
    openCounterProposalsSection(envelopes, cards),
    undecidedTrickleSection(envelopes, cards),
    pendingAskContextsSection(envelopes),
    foldStatusSection(envelopes),
  ].join("\n");
}
