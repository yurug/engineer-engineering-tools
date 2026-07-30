// Module: schema-error -- formats a zod `.strict()` failure into the
// field-path message PR7 promises ("validation failures name the failing
// field path"). Ported from forebrief's packages/server/src/schema-error.ts
// (kb/primitives/spec.md's chart section: "same discipline as forebrief's
// own schema errors") -- that file's own header records the audit finding
// this fixes (a fixed string with issues buried in `details`, unread by
// the CLI/web clients); the same shape is reused here rather than
// reinvented, so an agent debugging either package sees the same message
// grammar.
import type { ZodIssue } from "zod";

/**
 * @returns a zod issue path as dotted/bracketed segments, e.g.
 *   `steps[2].labels.svc`. Takes `unknown[]` (not `ZodIssue["path"]`) so
 *   callers can reuse it on a path already decoded one boundary away from
 *   a real `ZodIssue` (mirrors forebrief's http-client.ts/lib/api.ts reuse).
 */
export function formatIssuePath(path: readonly unknown[]): string {
  return path.reduce<string>((acc, segment) => {
    if (typeof segment === "number") return `${acc}[${String(segment)}]`;
    const key = String(segment);
    return acc.length === 0 ? key : `${acc}.${key}`;
  }, "");
}

/**
 * `unrecognized_keys` issues carry the offending key names in a `keys`
 * array, at the object's own root path (`path: []`) -- neither flavor of
 * zod puts the key name in `path` itself. Handled once, here, so PR7 holds
 * identically whether `issues` came from classic zod (whose default
 * message already spells the key out, e.g. `Unrecognized key: "bogus"`) or
 * zod/mini (../envelope.ts's header: mini's default message is the
 * generic "Invalid input", no key name at all -- mini trades away
 * message-formatting code for bundle size). Read structurally rather than
 * trusting either flavor's default wording to keep saying so.
 */
function unrecognizedKeys(issue: ZodIssue): readonly string[] | null {
  if (issue.code !== "unrecognized_keys") return null;
  const keys = (issue as { keys?: unknown }).keys;
  return Array.isArray(keys) ? (keys as string[]) : null;
}

/**
 * @param prefix e.g. "malformed diagram spec" -- names WHAT failed to parse
 * @param issues `parsed.error.issues` from a failed zod `.safeParse`
 * @returns `"<prefix>: <first issue path> — <first issue message>"`, plus
 *   `" (+N more)"` when more than one issue was reported
 * @invariant PR7 -- the failing field path (or, for an unrecognized key,
 *   the key name itself) is always present in the returned string, never
 *   only in a `details` object a caller might not read.
 */
export function schemaErrorMessage(prefix: string, issues: readonly ZodIssue[]): string {
  const first = issues[0];
  if (!first) return `${prefix}: no validation issues reported`;
  const more = issues.length > 1 ? ` (+${String(issues.length - 1)} more)` : "";
  const keys = unrecognizedKeys(first);
  if (keys) {
    return `${prefix}: unrecognized field(s) ${keys.join(", ")}${more}`;
  }
  const path = formatIssuePath(first.path) || "(root)";
  return `${prefix}: ${path} — ${first.message}${more}`;
}

/**
 * Thrown by a renderer when a spec fails validation. Carries the full zod
 * issue list in `issues` (mirroring `AppError.details` in
 * kb/conventions/error-handling.md) for callers that want field-level
 * detail beyond the first issue baked into `message`.
 */
export class PrimitiveSchemaError extends Error {
  constructor(
    prefix: string,
    readonly issues: readonly ZodIssue[],
  ) {
    super(schemaErrorMessage(prefix, issues));
    this.name = "PrimitiveSchemaError";
  }
}
