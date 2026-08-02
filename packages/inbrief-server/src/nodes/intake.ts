// Module: nodes/intake -- the gate a proposed node passes before it can enter
// the map.
//
// This is the load-bearing piece of the whole design. Round 1 decided that the
// agent proposes the graph and the citations constrain it
// (kb/decisions-round-1.md, and ADR-005 for the ordering half). "Constrain" has
// to mean something mechanical or it means nothing, and this module is where it
// means something: a node that does not point at something really in the
// project does not get admitted, however plausible it reads.
//
// @invariant P1 -- admitted requires every citation to validate. A node that
//   fails still comes back, so the caller can render it visibly unverified.
//   Returning null here would be the silent drop P1 forbids.
// @invariant P5 -- the answer budget is enforced, not suggested.
import { makeCitationMinter, validateCodeCitation, type CitationRepoAccess } from "@brief/core";
import type { Citation } from "@brief/shared";
import { validateRequires } from "./requires";
import { validateTerminology } from "./terminology";
import { renderVisual } from "./render-visual";
import {
  ANSWER_WORD_BUDGET,
  NODE_MODES,
  QUESTION_WORD_BUDGET,
  type IntakeResult,
  type NodeMode,
  type NodeSubmission,
  type Refusal,
  type StoredNode,
} from "../types/node";

/**
 * Runs every intake check against one proposed node.
 *
 * @param submission the node as the agent proposed it, with no rev or hash
 * @param repo how to read the project being taught
 * @param existing the map as it stands, needed to check prerequisites; a graph
 *   check cannot be made against one node in isolation
 * @returns the node with its citations minted, the per-citation verdicts, and
 *   every reason it was refused; `admitted` is true only when there are none
 * @invariant every citation is minted and validated even when an earlier check
 *   already refused the node. WHY: the caller renders a refused node as
 *   unverified, and rendering it needs the verdicts. Short-circuiting would
 *   save a file read and cost the human the explanation.
 */
export async function intakeNode(
  submission: NodeSubmission,
  repo: CitationRepoAccess,
  existing: readonly StoredNode[] = [],
): Promise<IntakeResult> {
  const refusals: Refusal[] = [
    ...validateRequires(submission, existing),
    ...validateTerminology(submission, existing),
  ];

  if (submission.citations.length === 0) refusals.push("no-citation");
  if (countWords(submission.answer) > ANSWER_WORD_BUDGET) refusals.push("answer-over-budget");
  if (countWords(submission.question) > QUESTION_WORD_BUDGET) refusals.push("question-over-budget");
  if (!hasVisual(submission)) refusals.push("visual-missing");
  if (!isTaughtMode(submission.mode)) refusals.push("mode-out-of-scope");

  const minted = await mintAndValidate(submission, repo);
  if (minted.some((m) => m.state !== "valid")) refusals.push("citation-unresolved");

  const visual = hasVisual(submission)
    ? await renderVisual(submission.visual)
    : { kind: "invalid" as const, spec: { kind: "missing" }, error: "visual missing" };
  if (visual.kind === "invalid" && hasVisual(submission)) {
    refusals.push(`visual-invalid:${visual.error}`);
  }

  const node: StoredNode = {
    id: submission.id,
    mode: submission.mode,
    question: submission.question,
    answer: submission.answer,
    visual,
    citations: minted.map((m) => m.citation),
    requires: submission.requires,
    introduces: submission.introduces,
    uses: submission.uses,
    ...(submission.portableConcept ? { portableConcept: submission.portableConcept } : {}),
    ...(submission.lifetime ? { lifetime: submission.lifetime } : {}),
  };
  return {
    admitted: refusals.length === 0,
    node,
    verdicts: minted.map(({ state, reason }) =>
      reason === undefined ? { state } : { state, reason },
    ),
    refusals,
  };
}

function hasVisual(submission: NodeSubmission): boolean {
  const visual = submission.visual as NodeSubmission["visual"] | undefined;
  return Boolean(visual && typeof visual === "object" && visual.kind.trim());
}

/**
 * @returns one entry per submitted citation, in submission order, each carrying
 *   the minted citation and how it validated
 * @invariant the agent never hashes. Minting fills `rev` and `contentHash`
 *   server-side; a submission that supplied them would have them verified
 *   rather than trusted, which is core's rule and not inbrief's to relax.
 */
async function mintAndValidate(
  submission: NodeSubmission,
  repo: CitationRepoAccess,
): Promise<{ citation: Citation; state: "valid" | "drifted" | "broken"; reason?: string }[]> {
  const mint = makeCitationMinter(repo);
  return Promise.all(
    submission.citations.map(async (input) => {
      // A kb-kind citation carries no hash and is not minted; it validates
      // against the worktree by anchor. Step 1 only reads code, so anything
      // non-code is passed through and left for the caller to validate.
      if (input.kind !== "code") {
        return {
          citation: input,
          state: "broken" as const,
          reason: "kb citations arrive in step 3",
        };
      }
      const citation = await mint(input);
      const result = await validateCodeCitation(
        citation as Extract<Citation, { kind: "code" }>,
        repo,
      );
      return result.reason === undefined
        ? { citation: result.citation, state: result.state }
        : { citation: result.citation, state: result.state, reason: result.reason };
    }),
  );
}

/** Splits on any whitespace run; a trailing newline must not read as a word. */
function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

/**
 * @param mode the submitted value, which is typed but arrives over a wire and
 *   may therefore be anything
 * @returns whether inbrief teaches this mode at all (ADR-006)
 */
function isTaughtMode(mode: NodeMode): boolean {
  return (NODE_MODES as readonly string[]).includes(mode);
}
