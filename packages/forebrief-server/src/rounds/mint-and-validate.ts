// Module: rounds/mint-and-validate -- turns one parsed CardSubmission into
// a StoredCard (citations minted, grounding computed, P1/P2) plus its CLI
// validation-report entries (kb/spec/cli-contract.md).
//
// This module is where kb/plan.md step 2's named unknown gets proven: a
// CardSubmission's citations are ordinary CitationInput values (code OR
// kb, kb/spec/data-model.md), so core's existing makeCitationMinter /
// validateCodeCitation / validateKbCitation cover the claim shapes
// (consequence text + undo paths) with no schema surgery in
// @brief/shared -- see test/rounds.test.ts's first red/green pair.
import {
  makeCitationMinter,
  validateCodeCitation,
  validateKbCitation,
  type CitationRepoAccess,
  type CitationKbAccess,
} from "@brief/core";
import { AppError } from "@brief/shared";
import type { Citation, CitationInput, CitationValidationResult } from "@brief/shared";
// @brief/primitives is genuine ESM (../types/round.ts's header on
// CardVisualSubmissionSchema has the full CJS/ESM-interop rationale); every
// VALUE this module needs from it is loaded via `await import(...)` below,
// the one interop path guaranteed to work regardless of Node version (a
// static `import` here would be a `require()` call TypeScript refuses to
// emit for an ESM-only target, TS1479). Types alone can be named statically
// with the `resolution-mode` attribute (types/round.ts uses the same one).
import type { DiagramRenderOutcome, DiagramSpec } from "@brief/primitives/diagram" with {
  "resolution-mode": "import",
};
import type { FilmstripRenderOutcome, FilmstripSpec } from "@brief/primitives/filmstrip" with {
  "resolution-mode": "import",
};
import { groundClaim, groundReversibility, reportStatus } from "../render/ground";
import type {
  CardSubmission,
  CardValidationReport,
  CardVisualSubmission,
  CitationReportEntry,
  StoredCard,
  StoredConsequence,
  StoredOption,
  StoredReversibility,
  StoredVisual,
} from "../types/round";

export interface MintAndValidateDeps {
  repo: CitationRepoAccess;
  kb: CitationKbAccess;
}

/** Mints (code citations only) then validates any one submitted citation, whatever kind it is. */
async function mintAndValidateOne(
  input: CitationInput,
  deps: MintAndValidateDeps,
): Promise<{ citation: Citation; result: CitationValidationResult }> {
  if (input.kind === "kb") {
    const result = await validateKbCitation(input, deps.kb);
    return { citation: input, result };
  }
  const minted = await makeCitationMinter(deps.repo)(input);
  // WHY the runtime check (not just a cast): makeCitationMinter's declared
  // return type is the general `Citation` union (mint.ts), even though a
  // code INPUT always mints into a code citation -- this is the narrowing
  // that fact requires, defensively, rather than an unchecked assertion.
  if (minted.kind !== "code") {
    throw new Error(
      "invariant violated: minting a code citation input produced a non-code citation",
    );
  }
  const result = await validateCodeCitation(minted, deps.repo);
  // A drift-repaired citation's relocated range lives on `result.citation` --
  // that is the range the STORED card should carry going forward (P10).
  return { citation: result.citation, result };
}

async function mintConsequence(
  submission: CardSubmission["options"][number]["consequences"][number],
  ref: string,
  deps: MintAndValidateDeps,
  report: CitationReportEntry[],
): Promise<StoredConsequence> {
  if (!submission.citation) {
    return { text: submission.text, grounding: { kind: "conjecture" } };
  }
  const { citation, result } = await mintAndValidateOne(submission.citation, deps);
  report.push({ ref, status: reportStatus(result.state) });
  return { text: submission.text, citation, grounding: groundClaim(citation, result.state) };
}

async function mintReversibility(
  submission: CardSubmission["options"][number]["reversibility"],
  ref: string,
  deps: MintAndValidateDeps,
  report: CitationReportEntry[],
): Promise<StoredReversibility> {
  if (!submission.undo) {
    return {
      class: submission.class,
      grounding: groundReversibility(submission.class, undefined, undefined),
    };
  }
  const { citation, result } = await mintAndValidateOne(submission.undo, deps);
  report.push({ ref, status: reportStatus(result.state) });
  return {
    class: submission.class,
    undo: citation,
    grounding: groundReversibility(submission.class, citation, result.state),
  };
}

async function mintOption(
  submission: CardSubmission["options"][number],
  deps: MintAndValidateDeps,
  report: CitationReportEntry[],
): Promise<StoredOption> {
  const consequences = await Promise.all(
    submission.consequences.map((consequence, i) =>
      mintConsequence(consequence, `${submission.key}.consequences[${String(i)}]`, deps, report),
    ),
  );
  const reversibility = await mintReversibility(
    submission.reversibility,
    `${submission.key}.reversibility.undo`,
    deps,
    report,
  );
  return { key: submission.key, label: submission.label, consequences, reversibility };
}

/**
 * Turns a render outcome that ISN'T `"ok"` into the E_SCHEMA rejection the
 * whole round dies on. `"invalid"` carries the primitive's own field path
 * (PR7) already; `"skew"` does not carry one from the primitive itself
 * (ADR-012's contract for a DIRECT renderer is a visible banner, never a
 * throw -- there is always a later read to show the banner AT). Post-time
 * rendering has no later: a skewed visual would be frozen, wrong, and
 * silent forever, so forebrief fails the post instead of storing it. `ref`
 * (e.g. `cards[1].visual`) stands in for the field path a schemaVersion
 * mismatch has no zod issue to carry one for.
 */
function visualRenderError(
  outcome: { status: "invalid"; error: { message: string } } | { status: "skew"; svg: string },
  ref: string,
  refreshCommand: string,
): AppError<"E_SCHEMA"> {
  if (outcome.status === "invalid") {
    return new AppError("E_SCHEMA", `${ref}: ${outcome.error.message}`, { ref });
  }
  return new AppError(
    "E_SCHEMA",
    `${ref}.schemaVersion: does not match the installed @brief/primitives build -- refresh with \`${refreshCommand}\` and repost`,
    { ref },
  );
}

/**
 * Renders a card's one optional visual (diagram or filmstrip -- chart/
 * matrix/claim are out of this slice, types/round.ts's header) and stores
 * the submission's own spec beside the rendered output (provenance +
 * re-render, kb/spec/data-model.md). `submission` only cleared
 * `CardVisualSubmissionSchema`'s minimal shape gate (an object naming its
 * own `kind`) at the synchronous parse layer -- the REAL schema check
 * happens HERE, inside `renderDiagram`/`renderFilmstrip`'s own validation
 * against @brief/primitives' unmodified schemas, dynamically imported
 * (types/round.ts's header has the full CJS/ESM rationale).
 *
 * @throws {AppError} E_SCHEMA naming the failing field path -- never lets a
 *   half-rendered round land: `mintAndValidateCard`'s caller writes the
 *   round file only after every card's render (this function) has resolved.
 */
async function renderVisual(
  submission: CardVisualSubmission | undefined,
  ref: string,
): Promise<StoredVisual | undefined> {
  if (!submission) return undefined;
  if (submission.kind === "diagram") {
    const { renderDiagram } = await import("@brief/primitives/diagram");
    const outcome: DiagramRenderOutcome = await renderDiagram(submission);
    if (outcome.status === "ok") {
      // Cast justified by `outcome.status === "ok"`: renderDiagram only
      // reaches this branch after its OWN internal DiagramSpecSchema
      // .safeParse succeeded against this exact `submission` -- render.ts
      // just doesn't hand the parsed object back, only the SVG outcome.
      return { kind: "diagram", spec: submission as unknown as DiagramSpec, svg: outcome.svg };
    }
    const { PRIMITIVES_REFRESH_COMMAND } = await import("@brief/primitives");
    throw visualRenderError(outcome, ref, PRIMITIVES_REFRESH_COMMAND);
  }
  if (submission.kind === "filmstrip") {
    const { renderFilmstrip } = await import("@brief/primitives/filmstrip");
    const outcome: FilmstripRenderOutcome = await renderFilmstrip(submission);
    if (outcome.status === "ok") {
      return {
        kind: "filmstrip",
        spec: submission as unknown as FilmstripSpec,
        steps: outcome.steps,
      };
    }
    const { PRIMITIVES_REFRESH_COMMAND } = await import("@brief/primitives");
    throw visualRenderError(outcome, ref, PRIMITIVES_REFRESH_COMMAND);
  }
  throw new AppError(
    "E_SCHEMA",
    `${ref}.kind: must be "diagram" or "filmstrip" (chart/matrix/claim are out of this slice), got ${JSON.stringify(submission.kind)}`,
    { ref },
  );
}

/**
 * @param submission a zod-parsed CardSubmission (schema already rejected
 *   grounding/id/timestamp fields and irreversible+undo, E_SCHEMA)
 * @param cardRef this card's own locator in the enclosing submission (e.g.
 *   `cards[1]` from a round, `card` from a trickle post) -- used only to
 *   name the field path of a visual that fails to render; every other
 *   error path in this module already gets its path from zod directly.
 * @returns the StoredCard (citations minted, grounding attached, visual
 *   rendered) and this card's slice of the CLI validation report
 * @invariant P1/P2 every rendered grounding kind on the returned card came
 *   from a fresh validation result computed in this pass, never guessed
 */
export async function mintAndValidateCard(
  submission: CardSubmission,
  id: string,
  roundId: string | null,
  postedAt: string,
  deps: MintAndValidateDeps,
  cardRef = "card",
): Promise<{ card: StoredCard; report: CardValidationReport }> {
  const citations: CitationReportEntry[] = [];
  const options = await Promise.all(
    submission.options.map((option) => mintOption(option, deps, citations)),
  );
  const visual = await renderVisual(submission.visual, `${cardRef}.visual`);
  const card: StoredCard = {
    id,
    round_id: roundId,
    posted_at: postedAt,
    kind: submission.kind,
    prompt: submission.prompt,
    context: submission.context,
    options,
    default: submission.default,
    ...(visual !== undefined ? { visual } : {}),
  };
  return { card, report: { card: id, citations } };
}
