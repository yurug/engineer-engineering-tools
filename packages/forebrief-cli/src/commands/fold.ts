// Module: commands/fold -- `forebrief fold --round ID | --card ID [--out DIR]`
// (kb/spec/cli-contract.md, kb/architecture/decisions/ADR-005-fold-in-contract.md).
//
// Deliberately NOT an HTTP client, unlike every other command in this
// package (a genuine design decision -- dogfooded to this repo's own
// decisions.jsonl, card `step4-fold-cli-no-http`): fold-in reads already-
// durable state (`.forebrief/decisions.jsonl`, posted round files) and must
// work with no live session -- the common case is folding AFTER `forebrief
// stop`. It resolves the repo root itself (mirrors `serve`'s own
// resolution) rather than `discovery.ts`'s "find a live server" contract,
// and calls `@forebrief/server`'s fold/ modules directly instead of
// routing through HTTP.
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { AppError, systemClock } from "@brief/shared";
import {
  resolveRepoRoot,
  loadConfig,
  loadFoldSources,
  foldStateForCard,
  findRound,
  findCard,
  renderRoundDigest,
  renderAdrCard,
  type FoldInConfig,
  type StoredRound,
  type RenderedFile,
} from "@forebrief/server";
import type { Envelope } from "@brief/shared";
import { EXIT_ERROR, EXIT_OK, type Io } from "../output";

export interface FoldOptions {
  repoStartDir: string;
  round?: string;
  card?: string;
  out?: string;
  io: Io;
}

export async function runFoldCommand(opts: FoldOptions): Promise<number> {
  if ((opts.round === undefined) === (opts.card === undefined)) {
    opts.io.writeErr("forebrief: 'fold' requires exactly one of --round ID or --card ID");
    return EXIT_ERROR;
  }
  const repoRoot = await resolveRepoRoot(path.resolve(opts.repoStartDir));
  if (!repoRoot) {
    opts.io.writeErr(`forebrief: not a git repository: ${opts.repoStartDir}`);
    return EXIT_ERROR;
  }
  const outDir = opts.out === undefined ? undefined : path.resolve(opts.out);
  if (outDir !== undefined && isUnderForebriefState(repoRoot, outDir)) {
    // ADR-005: fold-in output is a review artifact for the AGENT, never a
    // server-boundary write -- `--out` must never land inside `.forebrief/`.
    opts.io.writeErr(`forebrief: --out must be outside .forebrief/ (ADR-005): ${outDir}`);
    return EXIT_ERROR;
  }

  try {
    const config = await loadConfig(repoRoot);
    const { envelopes, rounds } = await loadFoldSources(repoRoot);
    const file =
      opts.round !== undefined
        ? await foldRound(repoRoot, config.foldIn, opts.round, rounds, envelopes, outDir)
        : await foldCard(repoRoot, config.foldIn, opts.card as string, rounds, envelopes, outDir);
    await emit(file, outDir, opts.io);
    return EXIT_OK;
  } catch (error) {
    opts.io.writeErr(`forebrief: ${error instanceof Error ? error.message : String(error)}`);
    return EXIT_ERROR;
  }
}

function isUnderForebriefState(repoRoot: string, candidate: string): boolean {
  const stateDir = path.join(repoRoot, ".forebrief");
  const rel = path.relative(stateDir, candidate);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

async function foldRound(
  repoRoot: string,
  foldIn: FoldInConfig,
  roundId: string,
  rounds: readonly StoredRound[],
  envelopes: readonly Envelope[],
  outDir: string | undefined,
): Promise<RenderedFile> {
  const round = findRound(rounds, roundId);
  if (!round) throw new AppError("E_FOLD_TARGET", `no posted round with id ${roundId}`);
  const cards = round.cards.map((card) => ({ card, state: foldStateForCard(envelopes, card.id) }));
  return renderRoundDigest(repoRoot, foldIn, round, cards, systemClock, outDir);
}

async function foldCard(
  repoRoot: string,
  foldIn: FoldInConfig,
  cardId: string,
  rounds: readonly StoredRound[],
  envelopes: readonly Envelope[],
  outDir: string | undefined,
): Promise<RenderedFile> {
  const found = findCard(rounds, cardId);
  if (!found) throw new AppError("E_FOLD_TARGET", `no posted card with id ${cardId}`);
  if (found.card.kind !== "adr") {
    throw new AppError(
      "E_FOLD_TARGET",
      `card ${cardId} is kind "${found.card.kind}", not "adr" -- --card folds adr-kind cards ` +
        "only; question-kind cards fold as part of a round digest (--round)",
    );
  }
  const state = foldStateForCard(envelopes, cardId);
  // outDir participates in numbering: folding a batch into --out must not
  // hand every file the same id (render.ts's nextAdrNumber note).
  return renderAdrCard(repoRoot, foldIn, found.card, state, systemClock, outDir);
}

/** Prints to stdout with no `--out`, else writes the file under `outDir` and prints its path (config-and-formats.md: "the AGENT then reviews/commits them"). */
async function emit(file: RenderedFile, outDir: string | undefined, io: Io): Promise<void> {
  if (outDir === undefined) {
    io.writeOut(file.content);
    return;
  }
  await fs.mkdir(outDir, { recursive: true });
  const target = path.join(outDir, file.filename);
  await fs.writeFile(target, file.content, "utf8");
  io.writeOut(JSON.stringify({ file: target }));
}
