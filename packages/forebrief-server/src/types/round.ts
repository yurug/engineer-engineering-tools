// Module: types/round -- zod schemas for the agent -> server round/card
// wire shape (kb/spec/data-model.md#round-submission) and the server-
// produced Stored Card shape it mints into.
//
// @invariant P1/P2: CardSubmissionSchema is `.strict()` -- a submission
//   naming `grounding`, `id`, `round_id`, or `posted_at` is rejected
//   E_SCHEMA at parse time (ADR-002's adversarial case) with zero extra
//   code, since those fields simply do not exist on this schema.
// @invariant P2: an `irreversible` option carrying an `undo` citation is a
//   structural contradiction (a validated undo would contradict the
//   class) -- rejected E_SCHEMA here, before any citation is even minted.
import { z } from "zod";
import { CitationInputSchema, type CitationInput, type Citation } from "@brief/shared";
// Card visual (round-1 decision, .forebrief/decisions.jsonl seq 36/37,
// cards 01KYKTFBX56ZWFN6JPQP3M4VBS/01KYKTFBX6WMM6F4GPHRQZ6GJ0): ONE optional
// visual per CARD (not per option), rendered at POST time server-side. The
// schemas are imported, never re-declared -- forebrief validates a spec
// exactly as @brief/primitives defines it, so a schema change there
// never needs a matching hand-edit here.
//
// Only diagram and filmstrip are in scope. Chart is OUT: `vega`/`vega-lite`
// are reachable only through the chart entry's own dynamic `import()`
// (kb/primitives/spec.md#3-chart in the backbrief repo), but importing
// "@brief/primitives/chart" at all -- even for its schema alone --
// would still add the Vega dependency to `@forebrief/server`'s Node
// install, for a case this slice never promised (the ADR-comparison cards
// that motivated this feature are diagrams/tables, never charts). Matrix
// is out because the round's own compare view already IS the matrix
// (kb/primitives/implementation-slices.md Step 2); claim is out because a
// claim card nested inside a decision card is an outline, not a card
// (kb/primitives/spec.md's own agent note on `ClaimSpec.evidence`).
// `resolution-mode` attribute required by TS1541: a type-only import of an
// ESM-only package from this CommonJS file otherwise has no way to know
// which module resolution algorithm to apply when locating the .d.ts.
import type { DiagramSpec } from "@brief/primitives/diagram" with {
  "resolution-mode": "import",
};
import type { FilmstripSpec } from "@brief/primitives/filmstrip" with {
  "resolution-mode": "import",
};

export const OPTION_KEYS = ["1", "2", "3", "4"] as const;
export const OptionKeySchema = z.enum(OPTION_KEYS);
export type OptionKey = (typeof OPTION_KEYS)[number];

export const CardKindSchema = z.enum(["question", "adr"]);
export type CardKind = z.infer<typeof CardKindSchema>;

export const ReversibilityClassSchema = z.enum(["reversible", "costly", "irreversible"]);
export type ReversibilityClass = z.infer<typeof ReversibilityClassSchema>;

const ConsequenceSubmissionSchema = z
  .object({
    text: z.string().min(1),
    citation: CitationInputSchema.optional(),
  })
  .strict();
export type ConsequenceSubmission = z.infer<typeof ConsequenceSubmissionSchema>;

const ReversibilitySubmissionSchema = z
  .object({
    class: ReversibilityClassSchema,
    undo: CitationInputSchema.optional(),
  })
  .strict()
  .superRefine((reversibility, ctx) => {
    if (reversibility.class === "irreversible" && reversibility.undo !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["undo"],
        message:
          "an irreversible option cannot carry an undo citation -- a citable undo path would contradict the class (P2)",
      });
    }
  });
export type ReversibilitySubmission = z.infer<typeof ReversibilitySubmissionSchema>;

const OptionSubmissionSchema = z
  .object({
    key: OptionKeySchema,
    label: z.string().min(1),
    consequences: z.array(ConsequenceSubmissionSchema).min(1),
    reversibility: ReversibilitySubmissionSchema,
  })
  .strict();
export type OptionSubmission = z.infer<typeof OptionSubmissionSchema>;

/**
 * A card's one optional visual, shared by every option (never per-option --
 * the decision this schema encodes, `.forebrief/decisions.jsonl` seq 36/37).
 *
 * Only a minimal shape gate lives HERE (a plain object naming its own
 * `kind`) -- the real schema is @brief/primitives' own DiagramSpecSchema
 * / FilmstripSpecSchema, run in `rounds/mint-and-validate.ts` at render
 * time, imported there and never re-declared (the decision's own wording).
 *
 * WHY the real schema isn't embedded here, at the synchronous parse layer,
 * the way every other nested schema in this file is: @brief/primitives
 * is genuine ESM (its `package.json`'s `"type": "module"`, the CJS/ESM-
 * interop rationale `../architecture/overview.md`'s "primitives step 2"
 * note already covers for `@forebrief/web`), while `@forebrief/server`
 * compiles to CommonJS (`tsconfig.base.json`: `"module": "CommonJS"`) -- a
 * synchronous VALUE import of an ESM-only package from a CommonJS file is
 * not a `require()` call TypeScript will emit (`tsc` refuses it, TS1479,
 * project-references build; a bare untyped `require()` happens to run on
 * this Node version but is not a portable fix). A render-time
 * `await import(...)` (mint-and-validate.ts) is the one CJS<->ESM interop
 * path that works independent of Node version, so real validation moves
 * there; this schema only keeps outright garbage (not an object, no
 * `kind`) from reaching that far with a less useful error.
 */
export const CardVisualSubmissionSchema = z.looseObject({ kind: z.string().min(1) });
export type CardVisualSubmission = z.infer<typeof CardVisualSubmissionSchema>;

export const CardSubmissionSchema = z
  .object({
    kind: CardKindSchema,
    prompt: z.string().min(1),
    context: z.string().min(1),
    options: z.array(OptionSubmissionSchema).min(2).max(4),
    default: OptionKeySchema,
    visual: CardVisualSubmissionSchema.optional(),
  })
  .strict()
  .superRefine((card, ctx) => {
    const keys = card.options.map((o) => o.key);
    if (new Set(keys).size !== keys.length) {
      ctx.addIssue({ code: "custom", path: ["options"], message: "option keys must be unique" });
    }
    if (!keys.includes(card.default)) {
      ctx.addIssue({
        code: "custom",
        path: ["default"],
        message: `default "${card.default}" does not name one of this card's options`,
      });
    }
  });
export type CardSubmission = z.infer<typeof CardSubmissionSchema>;

export const RoundSubmissionSchema = z
  .object({
    title: z.string().optional(),
    // T7: a round has >= 1 card -- an empty array fails here, E_SCHEMA.
    cards: z.array(CardSubmissionSchema).min(1),
  })
  .strict();
export type RoundSubmission = z.infer<typeof RoundSubmissionSchema>;

export const TrickleCardSubmissionSchema = z
  .object({
    card: CardSubmissionSchema,
  })
  .strict();
export type TrickleCardSubmission = z.infer<typeof TrickleCardSubmissionSchema>;

/** A claim's rendered verdict (P1/P2) -- computed server-side, the only authority (render/ground.ts). */
export type Grounding = { kind: "grounded"; citation: Citation } | { kind: "conjecture" };

export interface StoredConsequence {
  text: string;
  citation?: Citation;
  grounding: Grounding;
}

export interface StoredReversibility {
  class: ReversibilityClass;
  undo?: Citation;
  grounding: Grounding;
}

export interface StoredOption {
  key: OptionKey;
  label: string;
  consequences: StoredConsequence[];
  reversibility: StoredReversibility;
}

/** Rendered at POST time (rounds/mint-and-validate.ts), stored beside the
 *  submission's own spec (provenance + re-render, never re-rendered later --
 *  see kb/properties/edge-cases.md#T10). One SVG for a diagram; the ordered
 *  `{caption, svg}` steps for a filmstrip -- each already carries
 *  @brief/primitives' own trust-frame provenance stamp (`data-primitive`,
 *  PR8b) baked into the SVG string itself.
 *
 *  `mayBeStale` is set at RE-GROUNDING time, never stored: T10's decision
 *  (2026-07-28) chose to flag rather than accept the gap, with the rationale
 *  "outdated information is worse than no information at all: flagging is the
 *  least we can do". Note what the flag is NOT: a re-render. Re-rendering the
 *  stored spec is a no-op by construction -- the render is deterministic (the
 *  primitives' PR9), so an unchanged spec yields a byte-identical picture. A
 *  visual goes stale because its SPEC describes code that has since changed,
 *  which only the agent re-authoring the spec can fix. Flagging is therefore
 *  not a weaker version of re-rendering; it is the whole of what a reader can
 *  be told truthfully. The signal is conservative: ANY broken citation on the
 *  card raises it, because a diagram carries no per-node citation references
 *  to narrow it down, and over-flagging costs a reader far less than a
 *  confident picture of code that moved. */
export type StoredVisual =
  | { kind: "diagram"; spec: DiagramSpec; svg: string; mayBeStale?: boolean }
  | {
      kind: "filmstrip";
      spec: FilmstripSpec;
      steps: { caption: string; svg: string }[];
      mayBeStale?: boolean;
    };

export interface StoredCard {
  id: string;
  round_id: string | null;
  posted_at: string;
  kind: CardKind;
  prompt: string;
  context: string;
  options: StoredOption[];
  default: OptionKey;
  visual?: StoredVisual;
}

export interface StoredRound {
  id: string;
  title?: string;
  posted_at: string;
  cards: StoredCard[];
}

/** One entry of `post`'s CLI-facing validation report (kb/spec/cli-contract.md). */
export interface CitationReportEntry {
  ref: string;
  status: "valid" | "repaired" | "flagged";
}

export interface CardValidationReport {
  card: string;
  citations: CitationReportEntry[];
}

export type { CitationInput };
