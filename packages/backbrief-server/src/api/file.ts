// Module: api/file -- GET /api/file?path=&rev=, the read-only viewer's
// content source.
//
// Implements kb/spec/api-contracts.md's row ("content + language + size
// guard (T4)") and its two edge-case guards: T4 (huge/binary files) and T3
// (invalid UTF-8 is shown lossily-decoded, flagged, never silently). Size
// is checked BEFORE reading content whenever possible (worktree files, via
// RepoAccess.statWorktreeFile) so a huge file never gets fully buffered
// just to be rejected -- the one case that still reads-then-checks is a
// rev-pinned request, where `git show` has no cheap size-only form; T4's
// contract ("citations... validate by streaming hash without loading them
// into the viewer") is about the VIEWER refusing to render, which this
// still honors -- the content just isn't returned to the client either way.
import type { Context } from "hono";
import { AppError, detectKbRefs, detectLanguage } from "@backbrief/shared";
import type { RepoAccess } from "../repo";
import type { Config } from "../store/config";
import { decodeUtf8, looksBinary } from "../text-sniff";
import { isUnderBackbrief } from "../fsguard";

export interface FileRouteDeps {
  repo: RepoAccess;
  config: Config;
}

/**
 * @throws {AppError} E_NOT_FOUND if `path` is missing/outside the repo
 * @throws {AppError} E_TOO_LARGE if the file exceeds `config.maxFileBytes`
 * @throws {AppError} E_BINARY if a NUL byte is sniffed in the first 8000 bytes
 * @invariant T3 invalid UTF-8 renders lossily with `encoding: "utf8-lossy"`, never a hard error
 * @invariant step 3: `kbReferences` is always present (possibly `[]`), a
 *   pure scan of the returned `content` -- see shared/kb-ref.ts
 */
export function fileRoute(deps: FileRouteDeps) {
  return async (c: Context): Promise<Response> => {
    const relPath = c.req.query("path");
    if (!relPath) throw new AppError("E_NOT_FOUND", "path is required", {});
    // S1: `.backbrief/` (and everything under it, e.g. `server.json`'s
    // agent token) is never a legitimate read target for this viewer --
    // rejected as E_NOT_FOUND (not a distinct code) so a probing request
    // learns nothing beyond "doesn't exist", matching repo-tree.ts's own
    // dirent-level hiding of the same directory.
    if (isUnderBackbrief(deps.repo.repoRoot, relPath)) {
      throw new AppError("E_NOT_FOUND", `file not found: ${relPath}`, { path: relPath });
    }
    const rev = c.req.query("rev") ?? "worktree";

    if (rev === "worktree") await assertWithinSizeLimit(deps, relPath);

    const buffer = await deps.repo.readAtRevBuffer(rev, relPath);
    if (buffer === null) {
      throw new AppError("E_NOT_FOUND", `file not found: ${relPath}@${rev}`, {
        path: relPath,
        rev,
      });
    }
    if (rev !== "worktree" && buffer.byteLength > deps.config.maxFileBytes) {
      throw tooLargeError(relPath, buffer.byteLength, deps.config.maxFileBytes);
    }
    if (looksBinary(buffer)) {
      throw new AppError("E_BINARY", `binary file, use the download link: ${relPath}`, {
        path: relPath,
      });
    }

    const { content, encoding } = decodeUtf8(buffer);
    return c.json({
      path: relPath,
      rev,
      language: detectLanguage(relPath),
      size: buffer.byteLength,
      encoding,
      content,
      // Step 3 (kb/plan.md): the Code activity's "comments citing kb/ paths
      // become links" -- detection is pure text scanning (shared/kb-ref.ts,
      // "keep it dumb and precise"), computed here so the web viewer never
      // needs its own copy of the pattern. Security: this grants no read
      // access -- a hover card's later `GET /api/kb?path=...` fetch is
      // still gated by kb-access.ts's own `isWithinKbDir` check, unchanged.
      kbReferences: detectKbRefs(content),
    });
  };
}

async function assertWithinSizeLimit(deps: FileRouteDeps, relPath: string): Promise<void> {
  const stat = await deps.repo.statWorktreeFile(relPath);
  if (stat === null)
    throw new AppError("E_NOT_FOUND", `file not found: ${relPath}`, { path: relPath });
  if (stat.size > deps.config.maxFileBytes)
    throw tooLargeError(relPath, stat.size, deps.config.maxFileBytes);
}

function tooLargeError(relPath: string, size: number, limit: number): AppError {
  return new AppError(
    "E_TOO_LARGE",
    `${relPath} is ${String(size)} bytes, over the ${String(limit)}-byte limit (raise maxFileBytes in .backbrief/config.json)`,
    { path: relPath, size, limit },
  );
}
