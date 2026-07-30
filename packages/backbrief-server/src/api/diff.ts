// Module: api/diff -- GET /api/diff?from=&to=[&path=], the diff view's
// ONLY data source.
//
// Implements kb/spec/api-contracts.md's `GET /api/diff` row. Two response
// shapes behind the one route, matching NF3's laziness principle (the same
// split /api/tree vs /api/file already uses): omit `path` to get the file
// list (rename-paired, no content); supply it to get exactly ONE file's
// hunks. `serve --focus diff:FROM..TO` populates Session.focus with exactly
// this shape's `from`/`to` (daemon-entry.ts), but this route itself takes
// them as plain query params -- a diff VIEW is not required to match the
// session's focus (a reader may compare two arbitrary refs while a diff-
// focused session is open), so this route never reads SessionState.
// S2 (Phase 5 audit): `oldPath` is NOT a query param anymore -- it used to
// be client-suppliable and trusted outright, which let `?oldPath=
// .backbrief/<f>` smuggle backbrief's own bookkeeping into a hunk response.
// The route always re-derives it server-side (see the per-file branch
// below), so accepting it from the client was redundant even before it was
// a vulnerability.
import type { Context } from "hono";
import { AppError } from "@backbrief/shared";
import type { RepoAccess } from "../repo";

export interface DiffRouteDeps {
  repo: RepoAccess;
}

/**
 * @throws {AppError} E_BAD_REF if `from` is missing or either ref fails to resolve (T1's unborn-HEAD case included)
 * @throws {AppError} E_NOT_FOUND if `path` names a file the diff didn't actually change
 * @throws {AppError} E_BINARY if `path` names a binary file (hunks requested, not the file list)
 */
export function diffRoute(deps: DiffRouteDeps) {
  return async (c: Context): Promise<Response> => {
    const from = c.req.query("from");
    if (!from) throw new AppError("E_BAD_REF", "from is required", {});
    const to = c.req.query("to") ?? "worktree";

    await deps.repo.assertValidRef(from);
    if (to !== "worktree") await deps.repo.assertValidRef(to);

    const path = c.req.query("path");
    if (path === undefined) {
      const files = await deps.repo.diffFiles(from, to);
      return c.json({ files });
    }

    // Re-derives the file list to confirm `path` is actually part of THIS
    // diff (E_NOT_FOUND on a stale/mistyped path, never a silently empty
    // hunk list -- P1's "flagged, never a confusing blank" philosophy,
    // applied here to a request-shape error rather than a citation) and to
    // derive `oldPath` server-side -- S2: the ONLY source, never a query
    // param (see this file's module header). A second
    // full `--name-status` scan, not a pathspec-filtered one: filtering by
    // the new path alone (verified empirically against real git) makes a
    // RENAME look like a fresh add, the exact same loss ../diff.ts's header
    // documents for hunks -- correctly resolving a rename needs BOTH paths
    // in the pathspec, which is unknowable in advance for a caller that
    // doesn't already have them. `--name-status` is proportional to how
    // much the DIFF changed, not repo size, so this stays inside NF3's
    // actual concern (no whole-REPO walk) even though it costs one more
    // call than git-cli.md's per-file-open budget literally states.
    const files = await deps.repo.diffFiles(from, to);
    const entry = files.find((f) => f.path === path);
    if (!entry) {
      throw new AppError("E_NOT_FOUND", `not part of this diff: ${path}`, { path, from, to });
    }
    // S2 (Phase 5 audit): a client-supplied `oldPath` used to be trusted
    // outright and passed straight into a git pathspec -- `?path=<real>&
    // oldPath=.backbrief/<f>` could smuggle `.backbrief` content into a
    // hunk response, or garbage-parse two unrelated files as one rename.
    // `entry.oldPath` (re-derived above, from the SAME backbrief-excluded
    // `diffFiles` this route already re-scans for `path` itself) is the
    // only source of truth now -- the query param is ignored entirely.
    const hunks = await deps.repo.diffFileHunks(from, to, path, entry.oldPath);
    return c.json({
      path,
      status: entry.status,
      ...(entry.oldPath ? { oldPath: entry.oldPath } : {}),
      hunks,
    });
  };
}
