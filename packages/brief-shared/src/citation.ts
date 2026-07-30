// Module: citation -- Citation types + zod schemas.
//
// Implements kb/spec/data-model.md#citation. Two schemas per code citation:
// the *input* shape a producer (agent action, human annotation) may submit
// with `rev`/`contentHash` omitted, and the *canonical* shape the server
// mints those fields into (kb/spec/api-contracts.md#citation-minting -- "the
// agent never hashes", which is what keeps the skill file one page, NF4). A
// KbCitation has no minting step, so it needs only one schema.
// Key design decision: `endLine >= startLine` is a structural constraint
// (data-model.md says so directly), so it is enforced at parse time via
// `.refine` -- a malformed range fails fast as E_VALIDATION rather than
// limping into the "broken" render path, which is reserved for citations
// that are structurally fine but no longer resolve against the repo.
import { z } from "zod";

/** Repo-relative path, forward slashes -- data-model.md#citation. */
const RepoPathSchema = z.string().min(1);

export const CodeCitationInputSchema = z
  .object({
    kind: z.literal("code"),
    path: RepoPathSchema,
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive(),
    // Submission form: OPTIONAL. `rev` defaults to "worktree" and
    // `contentHash` is computed server-side at ingest; a supplied hash is
    // verified instead of trusted (data-model.md#citation).
    rev: z.string().min(1).optional(),
    contentHash: z.string().min(1).optional(),
  })
  .refine((c) => c.endLine >= c.startLine, {
    message: "endLine must be >= startLine",
    path: ["endLine"],
  });
export type CodeCitationInput = z.infer<typeof CodeCitationInputSchema>;

/** Canonical, post-mint shape: `rev` and `contentHash` are always present. */
export const CodeCitationSchema = z
  .object({
    kind: z.literal("code"),
    path: RepoPathSchema,
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive(),
    rev: z.string().min(1),
    contentHash: z.string().min(1),
  })
  .refine((c) => c.endLine >= c.startLine, {
    message: "endLine must be >= startLine",
    path: ["endLine"],
  });
export type CodeCitation = z.infer<typeof CodeCitationSchema>;

/** KB citations carry no hash -- they resolve by heading slug / property ID, not content match. */
export const KbCitationSchema = z.object({
  kind: z.literal("kb"),
  path: RepoPathSchema,
  anchor: z.string().min(1),
});
export type KbCitation = z.infer<typeof KbCitationSchema>;

// Plain z.union (not z.discriminatedUnion): the Code* schemas above are
// wrapped in `.refine`, which erases the object introspection
// discriminatedUnion needs. A 2-member union pays no real cost here.
export const CitationInputSchema = z.union([CodeCitationInputSchema, KbCitationSchema]);
export type CitationInput = z.infer<typeof CitationInputSchema>;

export const CitationSchema = z.union([CodeCitationSchema, KbCitationSchema]);
export type Citation = z.infer<typeof CitationSchema>;

/** Validation states a citation can render in -- computed, never stored (data-model.md#citation). */
export type ValidationState = "valid" | "drifted" | "broken";

/** One entry of a validation report -- kb/spec/api-contracts.md#citation-minting. */
export interface CitationValidationResult {
  citation: Citation;
  state: ValidationState;
  reason?: string;
}
