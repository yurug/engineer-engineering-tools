// Module: digest -- `.backbrief/state-digest` generation.
//
// Implements kb/spec/algorithms.md#state-digest-generation in full (step 2
// supersedes step 1's placeholder, which rendered the coverage/open-items
// sections as "not yet available"; step 3 adds the understood-targets list
// -- algorithms.md: "counts + lists of contested, questioned, AND understood
// targets -- the understood list is what lets the agent skip confirmed
// ground, US7"): coverage summary, open questions, open findings, open KB
// proposals, last 5 session titles+dates. Computed FRESH every call
// (session_end AND the live GET /api/state-digest route, api/digest.ts) --
// never a second source of truth to drift from the event logs (P6).
// @invariant NF5 hard cap 150 lines / 6KB: each list section keeps at most
// MAX_ITEMS_PER_SECTION entries (most recently folded first), while each
// section header states the TRUE total count -- "counts stay exact when
// lists truncate" (NF5's own wording). With 5 sessions + 4 list sections
// capped at 20 each, the worst case is far under 150 lines; a unit test
// with pathological volumes pins this.
// C2 (Phase 5 audit): the per-section item cap above bounds LIST LENGTH,
// not RENDERED LINES -- a question/finding/proposal's free-text field can
// itself embed newlines (multi-line agent/human prose), which used to blow
// straight through the "one line per item" assumption every render
// callback made. Two independent guards now hold NF5 regardless: (1) each
// free-text render collapses internal whitespace to a single space before
// it is ever joined into `lines`, so ONE item is always ONE line; (2)
// `enforceHardCap` is a final belt-and-braces backstop over the fully
// rendered text, in case some future section forgets (1) -- NF5 is a CI
// gate, not a per-callsite discipline this file can trust itself to keep
// re-applying correctly forever.
import type { Clock } from "@backbrief/shared";
import { foldFindings, foldOpenQuestions, foldProposals, foldReaderState } from "@backbrief/shared";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { resolveBackbriefPath } from "./fsguard";
import { listSessions } from "./store/session-store";
import { readAllSessionEnvelopesOrdered } from "./store/all-sessions";
import { computeCoverage } from "./coverage";
import { renderComprehensionMapSection } from "./digest-map-section";
import { loadLaconicDigestData, renderLaconicSection } from "./digest-laconic-section";
import type { RepoAccess } from "./repo";
import type { Config } from "./store/config";
import type { ModelSnapshot } from "./store/model-store";

const MAX_RECENT_SESSIONS = 5;
const MAX_ITEMS_PER_SECTION = 20;
const MAX_TOTAL_LINES = 150; // NF5
const MAX_TOTAL_BYTES = 6 * 1024; // NF5

export interface DigestDeps {
  repo: RepoAccess;
  config: Config;
  clock: Clock;
  /** v2 (ADR-005): a narrow structural interface (not the `ModelStore`
   *  class) -- DI, code-style.md: this module takes services, never
   *  imports store implementations it doesn't otherwise depend on. */
  modelStore: { snapshot(): ModelSnapshot };
  /** DI test seam (home.ts): defaults to `os.homedir()` -- lets a test fake the laconic home. */
  homedir?: string;
}

export async function generateDigest(repoRoot: string, deps: DigestDeps): Promise<string> {
  const ordered = await readAllSessionEnvelopesOrdered(repoRoot);
  const envelopes = ordered.map((entry) => entry.envelope);
  const readerStates = foldReaderState(ordered);
  const coverage = await computeCoverage(deps.repo, deps.config, readerStates);

  const contestedOrQuestioned = coverage.targets
    .filter((t) => t.status === "contested" || t.status === "questioned")
    .sort((a, b) => a.targetPath.localeCompare(b.targetPath));
  // US7 (step 3): the agent reads this list to skip re-explaining ground
  // the human already confirmed -- a plain status filter, not a fold of its
  // own, since `coverage.targets` already carries every target's current status.
  const understood = coverage.targets
    .filter((t) => t.status === "understood")
    .sort((a, b) => a.targetPath.localeCompare(b.targetPath));

  const recentSessions = (await listSessions(repoRoot)).slice(0, MAX_RECENT_SESSIONS);
  const modelSnapshot = deps.modelStore.snapshot(); // v2 (ADR-005): comprehension-map.md's digest requirement
  // laconic-bridge.md#read: re-read every call, like every other section (P6).
  const { snapshot: laconicSnapshot, writeAvailable: laconicWriteAvailable } =
    await loadLaconicDigestData(deps.config, process.env, deps.homedir ?? os.homedir());

  const lines: string[] = [
    "# backbrief state digest",
    "",
    `Generated: ${deps.clock.nowIso()}`,
    "",
    "## Coverage map",
    "",
    `unseen=${String(coverage.counts.unseen)} visited=${String(coverage.counts.visited)} questioned=${String(coverage.counts.questioned)} understood=${String(coverage.counts.understood)} contested=${String(coverage.counts.contested)}`,
    "",
    `### Contested / questioned targets (${String(contestedOrQuestioned.length)})`,
    "",
    ...renderTargetList(contestedOrQuestioned),
    "",
    `### Understood targets (${String(understood.length)}) -- skip re-explaining these (US7)`,
    "",
    ...renderTargetList(understood),
    "",
    "## Open questions",
    "",
    ...renderSection(
      foldOpenQuestions(envelopes),
      (q) => `- [${q.questionId}] ${collapseWhitespace(q.text)}`,
    ),
    "",
    "## Open findings",
    "",
    ...renderSection(
      foldFindings(envelopes).filter((f) => f.status === "open"),
      (f) => `- [${f.findingId}] ${collapseWhitespace(f.title)}`,
    ),
    "",
    "## Open KB proposals",
    "",
    ...renderSection(
      foldProposals(envelopes).filter((p) => p.status === "open"),
      (p) => `- [${p.proposalId}] ${p.kbPath}: ${collapseWhitespace(p.suggestion)}`,
    ),
    "",
    ...renderComprehensionMapSection(
      modelSnapshot.nodes,
      modelSnapshot.overlay,
      modelSnapshot.frontier,
    ),
    "",
    // laconic-bridge.md: omitted (not zeroed) when the bridge is off.
    ...(laconicSnapshot
      ? [...renderLaconicSection(laconicSnapshot, laconicWriteAvailable), ""]
      : []),
    "## Recent sessions",
    "",
    ...(recentSessions.length === 0
      ? ["_None yet._"]
      : recentSessions.map((s) => `- ${s.title} (${s.createdAt})`)),
  ];
  return enforceHardCap(lines.join("\n") + "\n");
}

/** C2: one rendered digest line per folded item, always -- a free-text
 *  field's own embedded newlines/tabs/runs-of-spaces collapse to single
 *  spaces before the item is ever joined into `lines`, so a multi-
 *  paragraph question/finding/proposal can never masquerade as several
 *  digest lines. */
export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * @invariant NF5 the final backstop: truncates on a LINE boundary (never
 *   mid-line) once EITHER the 150-line or the 6KB ceiling is crossed, and
 *   appends a footer stating exactly how many lines were cut -- so the
 *   digest stays honest about its own truncation even in the pathological
 *   case none of the per-section caps anticipated (module header, C2).
 */
function enforceHardCap(content: string): string {
  const lines = content.split("\n");
  if (lines.length <= MAX_TOTAL_LINES && Buffer.byteLength(content, "utf8") <= MAX_TOTAL_BYTES) {
    return content;
  }
  let kept = lines.slice(0, MAX_TOTAL_LINES - 1); // reserve one line for the footer itself
  while (kept.length > 0 && Buffer.byteLength(kept.join("\n"), "utf8") > MAX_TOTAL_BYTES - 200) {
    kept = kept.slice(0, -1);
  }
  const omitted = lines.length - kept.length;
  kept.push(
    `_(truncated: ${String(omitted)} line${omitted === 1 ? "" : "s"} omitted -- NF5's 150-line/6KB cap)_`,
  );
  return kept.join("\n") + "\n";
}

function renderTargetList(targets: { targetPath: string; status: string }[]): string[] {
  return renderSection(targets, (t) => `- ${t.targetPath} (${t.status})`);
}

/** @invariant NF5 keeps at most MAX_ITEMS_PER_SECTION items (most recently folded first) while the caller's own count stays exact. */
export function renderSection<T>(items: readonly T[], render: (item: T) => string): string[] {
  if (items.length === 0) return ["_None._"];
  const kept = items.slice(-MAX_ITEMS_PER_SECTION);
  const header =
    items.length > kept.length
      ? [`_(${String(items.length)} total, showing ${String(kept.length)} most recent)_`]
      : [];
  return [...header, ...kept.map(render)];
}

export async function writeDigest(repoRoot: string, content: string): Promise<void> {
  const filePath = resolveBackbriefPath(repoRoot, "state-digest");
  await fs.mkdir(path.dirname(filePath), { recursive: true }); // first session_end may race .backbrief/'s own creation
  await fs.writeFile(filePath, content, "utf8");
}

export async function readDigest(repoRoot: string): Promise<string | null> {
  try {
    return await fs.readFile(resolveBackbriefPath(repoRoot, "state-digest"), "utf8");
  } catch {
    return null;
  }
}
