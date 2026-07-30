// Module: api/tree -- GET /api/tree?path=, one lazy directory level.
//
// Implements kb/spec/api-contracts.md's row: "one directory level (lazy,
// NF3)" -> `{entries: [{name, path, kind, size?}]}`. Deliberately thin: all
// the real work (readdir, excludes filtering, .git/.backbrief hiding) lives
// in repo.ts/repo-tree.ts and ./excludes.ts; this file only sequences them
// into an HTTP response and the one error case (path not a directory).
import type { Context } from "hono";
import { AppError } from "@backbrief/shared";
import type { RepoAccess } from "../repo";
import type { Config } from "../store/config";
import { isExcluded } from "../excludes";

export interface TreeRouteDeps {
  repo: RepoAccess;
  config: Config;
}

/**
 * @invariant NF3 exactly one `listWorktreeDir` call per request -- no
 *   recursion, no walking beyond the requested level
 * @throws {AppError} E_NOT_FOUND if `path` doesn't resolve to a directory
 *   (fsguard's own E_NOT_FOUND covers the traversal-attempt case upstream)
 */
export function treeRoute(deps: TreeRouteDeps) {
  return async (c: Context): Promise<Response> => {
    const relPath = normalizeTreePath(c.req.query("path"));
    const entries = await deps.repo.listWorktreeDir(relPath);
    if (entries === null) {
      throw new AppError("E_NOT_FOUND", `not a directory: ${relPath === "" ? "." : relPath}`, {
        path: relPath,
      });
    }
    const visible = entries.filter((entry) => !isExcluded(entry.path, deps.config.excludes));
    return c.json({
      entries: visible.map((entry) => ({
        name: entry.name,
        path: entry.path,
        kind: entry.kind,
        ...(entry.size !== undefined ? { size: entry.size } : {}),
      })),
    });
  };
}

/** `?path=` is optional (root) and may carry stray leading/trailing slashes from a naive client-side join. */
function normalizeTreePath(raw: string | undefined): string {
  if (!raw || raw === "/") return "";
  return raw.replace(/^\/+/, "").replace(/\/+$/, "");
}
