// Module: schema-error -- formats a zod `.strict()` failure into the
// field-level message kb/spec/error-taxonomy.md's E_SCHEMA row promises
// ("field-level path in the message"). Shared by every ingest boundary
// (api/rounds.ts, api/records.ts, api/cards.ts) so the three throw sites
// can't drift into three different formats.
//
// Phase-5 audit finding (HIGH, ux): all three throw sites used a fixed
// string ("malformed round"/"malformed record"/"malformed trickle card")
// with the zod issues ONLY in `details` -- the CLI/web clients never read
// `details`, so the dominant agent-facing failure mode printed nothing
// useful. Fix: bake the first issue's path into the message itself; keep
// every issue in `details` for callers that DO read it (http-client.ts,
// lib/api.ts).
import type { ZodIssue } from "zod";

/** @returns a zod issue path as dotted/bracketed segments, e.g.
 *  `cards[0].options[1].reversibility.class`. Takes `unknown[]` (not
 *  `ZodIssue["path"]`) so http-client.ts/lib/api.ts can reuse it directly
 *  on a path decoded from an HTTP JSON body, one boundary removed from a
 *  real `ZodIssue`. */
export function formatIssuePath(path: readonly unknown[]): string {
  return path.reduce<string>((acc, segment) => {
    if (typeof segment === "number") return `${acc}[${String(segment)}]`;
    const key = String(segment);
    return acc.length === 0 ? key : `${acc}.${key}`;
  }, "");
}

/**
 * @param prefix e.g. "malformed round" -- names WHAT failed to parse
 * @param issues `parsed.error.issues` from a failed zod `.safeParse`
 * @returns `"<prefix>: <first issue path> — <first issue message>"`, plus
 *   `" (+N more)"` when more than one issue was reported
 */
export function schemaErrorMessage(prefix: string, issues: readonly ZodIssue[]): string {
  const first = issues[0];
  if (!first) return `${prefix}: no validation issues reported`;
  const path = formatIssuePath(first.path) || "(root)";
  const more = issues.length > 1 ? ` (+${String(issues.length - 1)} more)` : "";
  return `${prefix}: ${path} — ${first.message}${more}`;
}
