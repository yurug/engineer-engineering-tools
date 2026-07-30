// Module: session -- Session type + zod schema, and the Focus shape shared
// with propose_checkpoint (actions.ts).
//
// Implements kb/spec/data-model.md#session. Session *mode* (free-nav/tour/
// viewpoint/diff) is deliberately NOT part of this schema -- it is derived
// at read time from the event log and `focus`, never stored redundantly
// (data-model.md: "Session mode is derived, not stored").
import { z } from "zod";

export const FocusSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("system") }),
  z.object({ kind: z.literal("component"), path: z.string().min(1) }),
  // `to` may be the literal "worktree" (diff against uncommitted changes).
  z.object({ kind: z.literal("diff"), from: z.string().min(1), to: z.string().min(1) }),
]);
export type Focus = z.infer<typeof FocusSchema>;

export const SessionSchema = z.object({
  id: z.string().min(1),
  repoRoot: z.string().min(1),
  createdAt: z.string().min(1),
  endedAt: z.string().min(1).optional(),
  // v2 step 4 (ADR-005, kb/spec/pedagogy-engine.md#rupture): "paused-for-
  // change" -- set by `pause_for_change`, cleared by `resume_session`
  // (server/api/rupture-guards.ts). data-model.md#session already named
  // this third state; this schema is catching up to match it.
  status: z.enum(["active", "paused-for-change", "ended"]),
  // T1: unborn HEAD (zero commits) is represented as the literal "unborn",
  // never a crash -- see edge-cases.md#T1.
  headAtStart: z.string().min(1),
  focus: FocusSchema.optional(),
  title: z.string().min(1),
});
export type Session = z.infer<typeof SessionSchema>;
