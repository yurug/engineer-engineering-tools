// Module: api/kb -- GET /api/kb?path=, the KB viewer's content source.
//
// Implements kb/spec/api-contracts.md's row: "rendered KB file +
// frontmatter + anchors" -> here, "rendered" means markdown-it rendering
// happens CLIENT-SIDE (kb/external/markdown-rendering.md; keeping
// markdown-it out of the server mirrors codemirror6.md's "keep CM6 imports
// out of the server bundle" rule for the same reason: those are UI-layer
// dependencies) -- this endpoint returns raw markdown body + parsed
// frontmatter + the anchor/property-id sets the KB viewer needs to render
// a frontmatter table and resolve `#anchor` jump targets.
import * as path from "node:path";
import type { Context } from "hono";
import { AppError } from "@backbrief/shared";
import type { KbAccess } from "../kb-access";
import { declaredPropertyIds, headingSlugs } from "../kb-access";
import { parseKbFrontmatter } from "../kb-frontmatter";
import type { Config } from "../store/config";

export interface KbRouteDeps {
  kb: KbAccess;
  config: Config;
}

/**
 * @throws {AppError} E_NOT_FOUND if no KB is configured (T2: kbDir null),
 *   `path` falls outside `kbDir`, or the file doesn't exist -- api-
 *   contracts.md lists only E_NOT_FOUND for this route
 */
export function kbRoute(deps: KbRouteDeps) {
  return async (c: Context): Promise<Response> => {
    const relPath = c.req.query("path");
    if (!relPath || !isWithinKbDir(relPath, deps.config.kbDir)) {
      throw new AppError("E_NOT_FOUND", `not a KB path: ${relPath ?? "(missing)"}`, {
        path: relPath,
      });
    }
    const content = await deps.kb.readFile(relPath);
    if (content === null) {
      throw new AppError("E_NOT_FOUND", `KB file not found: ${relPath}`, { path: relPath });
    }
    const { frontmatter, body } = parseKbFrontmatter(content);
    return c.json({
      path: relPath,
      frontmatter,
      content: body,
      anchors: [...headingSlugs(content)],
      propertyIds: declaredPropertyIds(content),
    });
  };
}

/**
 * True iff `relPath` names a file at or under `kbDir`, AFTER normalizing away
 * any `..`/`.` segments.
 *
 * SECURITY (Phase 5 audit, 2026-07-19): the prior implementation was a naive
 * string-prefix test (`relPath.startsWith(kbDir + "/")`). Because
 * `makeFsKbAccess.readFile` resolves through `resolveRepoPath` (which confines
 * to the REPO root, not to `kbDir`), a path like `kb/../.backbrief/server.json`
 * passed the prefix test AND resolved inside the repo -- leaking the agent
 * bearer token to any holder of the weaker human token (`file.ts` already
 * guarded this via `isUnderBackbrief`; `kb.ts` did not). Normalizing here and
 * rejecting anything that escapes `kbDir` fixes the root cause: no `.backbrief`
 * path, and no other out-of-KB path, can reach `readFile` through this route.
 * @invariant P7 no request reads outside the repo; this narrows KB reads to `kbDir`
 * @invariant T2 no-KB mode (`kbDir: null`) means every KB path is unreachable here
 */
function isWithinKbDir(relPath: string, kbDir: string | null): boolean {
  if (kbDir === null) return false;
  // POSIX-normalize (KB paths are forward-slashed, api-contracts.md) so `..`
  // segments collapse before the containment test; a leading-`..` escape
  // normalizes to a path that no longer starts with `kbDir`.
  const normalized = path.posix.normalize(relPath);
  const normalizedDir = path.posix.normalize(kbDir);
  return normalized === normalizedDir || normalized.startsWith(`${normalizedDir}/`);
}
