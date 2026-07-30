// Module: fold/render -- markdown generation for `forebrief fold`
// (kb/spec/config-and-formats.md's "Fold-in output formats": one round
// digest, or one ADR-kind file per card).
//
// @invariant P3/P5 (fold/support.ts's header applies here too): this module
//   only READS the host repo's kb/ (to number the next digest/ADR file) and
//   a possible repo-local template override -- it never writes into kb/
//   itself. The CLI decides where the returned {filename, content} lands
//   (stdout or --out, always OUTSIDE `.forebrief/`, ADR-005).
// @invariant P7: every rationale in a card's `history` is rendered
//   verbatim, not only the CURRENT (governing) one -- a reconciliation
//   must never make an earlier decision's rationale disappear from the
//   fold, since kb-lint-forebrief.py's verbatim check resolves every
//   decision/reconciliation record tied to a folded card id, not only the
//   latest.
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Clock, Envelope } from "@brief/shared";
import { AppError } from "@brief/shared";
import { payloadOf } from "../records/queries";
import type { FoldInConfig } from "../config";
import type { StoredCard, StoredRound } from "../types/round";
import type { CardFoldState } from "./support";
import { DEFAULT_ADR_TEMPLATE, DEFAULT_ROUND_DIGEST_TEMPLATE } from "./templates";

export interface RenderedFile {
  filename: string;
  content: string;
}

function substitute(template: string, vars: Readonly<Record<string, string>>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => vars[key] ?? "");
}

/** @returns the literal text before `idFormat`'s first `%` conversion (e.g. "ADR-%03d" -> "ADR-"). */
function idPrefix(idFormat: string): string {
  const i = idFormat.indexOf("%");
  return i === -1 ? idFormat : idFormat.slice(0, i);
}

/** @returns `idFormat` with its `%0Nd`/`%d` conversion replaced by `n`, zero-padded to width N if given. */
export function formatId(idFormat: string, n: number): string {
  return idFormat.replace(/%(\d*)d/, (_match, width: string) =>
    width ? String(n).padStart(Number(width), "0") : String(n),
  );
}

/**
 * @param dirsAbs every directory that may already hold a numbered file; a
 *   missing one is skipped rather than treated as "start from 1", so a
 *   nonexistent `--out` never resets the count
 * @returns 1 + the highest number found across all of them
 */
async function nextNumber(dirsAbs: readonly string[], filenamePattern: RegExp): Promise<number> {
  const nums: number[] = [];
  for (const dirAbs of dirsAbs) {
    let names: string[];
    try {
      names = await fs.readdir(dirAbs);
    } catch {
      continue; // directory doesn't exist yet -- nothing numbered in it
    }
    for (const name of names) {
      const match = filenamePattern.exec(name);
      if (match) nums.push(Number(match[1]));
    }
  }
  return nums.length === 0 ? 1 : Math.max(...nums) + 1;
}

/** The configured destination, plus `--out` when it is a different directory. */
function dirsToScan(repoRoot: string, configuredDir: string, outDirAbs?: string): string[] {
  const configured = path.join(repoRoot, configuredDir);
  return outDirAbs === undefined || outDirAbs === configured
    ? [configured]
    : [configured, outDirAbs];
}

/**
 * @param outDirAbs the resolved `--out` directory, when one was given
 * @returns 1 + the highest existing `decisions-round-<n>.md` across
 *   `foldIn.roundsDir` and `outDirAbs` (config-and-formats.md)
 */
export async function nextRoundDigestNumber(
  repoRoot: string,
  config: FoldInConfig,
  outDirAbs?: string,
): Promise<number> {
  return nextNumber(
    dirsToScan(repoRoot, config.roundsDir, outDirAbs),
    /^decisions-round-(\d+)\.md$/,
  );
}

/**
 * @param outDirAbs the resolved `--out` directory, when one was given
 * @returns 1 + the highest existing ADR number across `foldIn.adrDir` and
 *   `outDirAbs`, per `idFormat`'s own prefix
 * @invariant WHY `outDirAbs` is scanned (bug found folding inbrief's round 1,
 *   2026-07-27): numbering read only `adrDir`, but `--out` writes somewhere
 *   else, so folding four adr-kind cards in one batch produced four files all
 *   numbered ADR-002. Nothing collided on disk because the slugs differ, so
 *   there was no error and no warning, just four ADRs claiming one id -- which
 *   a human notices only by reading them. `--out` is the normal path (the fold
 *   contract has the agent review before moving files into `kb/`), so the batch
 *   case is the common case rather than an edge one.
 */
export async function nextAdrNumber(
  repoRoot: string,
  config: FoldInConfig,
  outDirAbs?: string,
): Promise<number> {
  const prefix = idPrefix(config.idFormat).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return nextNumber(dirsToScan(repoRoot, config.adrDir, outDirAbs), new RegExp(`^${prefix}(\\d+)`));
}

/**
 * @returns the configured template's raw text -- the vendored default, or a
 *   repo-local override directory's `<kind>.md` (config-and-formats.md:
 *   `"template": "default" | path`; a non-default value names a DIRECTORY
 *   holding the same two filenames the kit's own `templates/forebrief/`
 *   does, so a repo overrides either or both without re-declaring the one
 *   it doesn't want to change).
 * @throws {AppError} E_CONFIG if `template` names a directory missing the
 *   file this fold kind needs -- a declared-but-broken override must fail
 *   loudly, never silently fall back (ADR-005's "configuration, not
 *   translation judgment").
 */
export async function loadTemplate(
  repoRoot: string,
  config: FoldInConfig,
  kind: "round-digest" | "adr",
): Promise<string> {
  if (config.template === "default") {
    return kind === "round-digest" ? DEFAULT_ROUND_DIGEST_TEMPLATE : DEFAULT_ADR_TEMPLATE;
  }
  const filePath = path.join(repoRoot, config.template, `${kind}.md`);
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    throw new AppError(
      "E_CONFIG",
      `foldIn.template "${config.template}" has no ${kind}.md at ${filePath}`,
      { template: config.template, kind },
    );
  }
}

function renderHistoryLine(e: Envelope): string {
  const p = payloadOf(e);
  const channel = String(p["source_channel"]);
  const rationale = typeof p["rationale"] === "string" ? p["rationale"] : "(no rationale recorded)";
  return e.type === "decision"
    ? `- decision (${String(p["mode"])}) via ${channel}, seq ${String(e.seq)} -- rationale: ${rationale}`
    : `- reconciliation (${String(p["mode"])}) via ${channel}, seq ${String(e.seq)}` +
        `${p["late"] === true ? " (late)" : ""} -- rationale: ${rationale}`;
}

function renderThread(thread: readonly Envelope[]): string {
  if (thread.length === 0) return "(no ask-why or ask-context thread)";
  return thread
    .map((e) => {
      const p = payloadOf(e);
      const suffix = e.type === "answer" ? `, re: seq ${String(p["ref_seq"])}` : "";
      return `- ${e.type} (seq ${String(e.seq)}${suffix}): ${String(p["text"])}`;
    })
    .join("\n");
}

function chosenLabel(card: StoredCard | undefined, governing: Envelope | undefined): string {
  if (!governing) return "(not yet decided)";
  const p = payloadOf(governing);
  const key = String(p["chosen"] ?? p["final"]);
  return card?.options.find((o) => o.key === key)?.label ?? key;
}

/** @returns one card's round-digest section (config-and-formats.md: "prompt, chosen, mode, rationale verbatim, thread verbatim"). */
function renderCardSection(n: number, card: StoredCard | undefined, state: CardFoldState): string {
  const prompt = card?.prompt ?? `(card ${state.cardId} -- not found in any posted round file)`;
  const history =
    state.history.length === 0
      ? "(no decision record yet)"
      : state.history.map(renderHistoryLine).join("\n");
  return [
    `## Card ${String(n)}: ${prompt}`,
    "",
    `**Chosen:** ${chosenLabel(card, state.governing)}`,
    "",
    "**History:**",
    "",
    history,
    "",
    "**Thread:**",
    "",
    renderThread(state.thread),
    "",
  ].join("\n");
}

/**
 * @param cards each round card paired with its resolved fold state, in the
 *   order they should appear (round.cards order, config-and-formats.md)
 */
export async function renderRoundDigest(
  repoRoot: string,
  config: FoldInConfig,
  round: StoredRound,
  cards: { card: StoredCard; state: CardFoldState }[],
  clock: Clock,
  outDirAbs?: string,
): Promise<RenderedFile> {
  const n = await nextRoundDigestNumber(repoRoot, config, outDirAbs);
  const template = await loadTemplate(repoRoot, config, "round-digest");
  const cardIds = cards.map((c) => c.card.id);
  const body = cards.map((c, i) => renderCardSection(i + 1, c.card, c.state)).join("\n");
  const content = substitute(template, {
    id: `decisions-round-${String(n)}`,
    summary: `${String(cardIds.length)} decisions folded from forebrief round "${round.title ?? round.id}".`,
    date: clock.nowIso().slice(0, 10),
    domain: config.domain,
    record_ids: `[${cardIds.join(", ")}]`,
    title: round.title ?? `Decisions -- round ${String(n)}`,
    round_id: round.id,
    posted_at: round.posted_at,
    cards: body,
  });
  return { filename: `decisions-round-${String(n)}.md`, content };
}

function renderConsequences(card: StoredCard, chosenKey: string): string {
  const option = card.options.find((o) => o.key === chosenKey);
  if (!option) return "(chosen option not found on the card)";
  const consequences = option.consequences
    .map((c) => `- ${c.text}${c.grounding.kind === "grounded" ? " (grounded)" : " (conjecture)"}`)
    .join("\n");
  const rev = option.reversibility;
  return `${consequences}\n\n**Reversibility:** ${rev.class} (${rev.grounding.kind}).`;
}

/** Every option the human did NOT choose, with its consequences and
 *  reversibility as the card showed them.
 *
 *  Dogfooding gap 3 (found by a KB-only quiz agent reading a folded ADR, 2026-07-26):
 *  the fold recorded the chosen option and silently discarded the rest, so a folded
 *  ADR could not answer "what else was on the table" — half of what the format exists
 *  for, when the card already held the answer. An ADR whose alternatives are gone
 *  reads as if the decision had no competition. */
function renderAlternatives(card: StoredCard, chosenKey: string): string {
  const others = card.options.filter((o) => o.key !== chosenKey);
  if (others.length === 0) return "(none — the card offered a single option.)";
  return others
    .map((option) => {
      const consequences = option.consequences
        .map(
          (c) =>
            `  - ${c.text}${c.grounding.kind === "grounded" ? " (grounded)" : " (conjecture)"}`,
        )
        .join("\n");
      const rev = option.reversibility;
      const body = consequences || "  - (no consequences were stated)";
      return `### Not chosen: ${option.label}\n\n${body}\n\n  **Reversibility:** ${rev.class} (${rev.grounding.kind}).`;
    })
    .join("\n\n");
}

function renderRationaleExchange(state: CardFoldState): string {
  const history = state.history.map(renderHistoryLine).join("\n") || "(no decision record yet)";
  return `${history}\n\n**Thread:**\n\n${renderThread(state.thread)}`;
}

/** @invariant caller (the CLI) must only call this for `card.kind === "adr"` (config-and-formats.md: adr-kind records fold as ADRs; question-kind cards fold only via the round digest). */
export async function renderAdrCard(
  repoRoot: string,
  config: FoldInConfig,
  card: StoredCard,
  state: CardFoldState,
  clock: Clock,
  outDirAbs?: string,
): Promise<RenderedFile> {
  const n = await nextAdrNumber(repoRoot, config, outDirAbs);
  const template = await loadTemplate(repoRoot, config, "adr");
  const adrNumber = formatId(config.idFormat, n);
  const slug = slugify(card.prompt);
  const chosenKey = state.governing
    ? String(payloadOf(state.governing)["chosen"] ?? payloadOf(state.governing)["final"])
    : card.default;
  const content = substitute(template, {
    id: `${adrNumber.toLowerCase()}-${slug}`,
    summary: card.prompt,
    date: clock.nowIso().slice(0, 10),
    domain: config.domain,
    record_id: card.id,
    adr_number: adrNumber,
    title: card.prompt,
    context: card.context,
    decision: chosenLabel(card, state.governing),
    consequences: renderConsequences(card, chosenKey),
    alternatives: renderAlternatives(card, chosenKey),
    rationale_exchange: renderRationaleExchange(state),
    not_covered: "(fill in before committing -- adjacent decisions this ADR does not make.)",
  });
  return { filename: `${adrNumber}-${slug}.md`, content };
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
}
