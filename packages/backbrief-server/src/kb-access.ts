// Module: kb-access -- KB file reads + heading-anchor resolution for
// KbCitation validation.
//
// Implements the KbCitation half of kb/spec/algorithms.md#citation-
// validation: "File must exist. anchor must resolve to a heading slug...
// (GitHub-style slugging...), or to a property/edge-case ID -- an ID is
// *declared* when \b(P|NF|T)\d+\b appears in a heading of that file."
// Deliberately NOT a markdown parser: KB files are simple enough (ATX
// headings only, `# ...` through `###### ...`) that a line-oriented regex
// is exact for this repo's own KB and cheaper than pulling in a markdown
// AST dependency ADR-004 doesn't already name.
import * as fs from "node:fs/promises";
import { resolveRepoPath } from "./fsguard";
import type { Config } from "./store/config";

/** Injectable KB file access -- lets validation tests use an in-memory fake. */
export interface KbAccess {
  readFile(relPath: string): Promise<string | null>;
}

/**
 * @returns true if no KB is available -- config-and-formats.md#kb-detection:
 *   "kbDir from config if set; else kb/ if it contains an INDEX.md; else
 *   no-KB mode." `config.kbDir === null` is the EXPLICIT opt-out (config.json
 *   set `kbDir: null`); otherwise the directory must actually contain an
 *   `INDEX.md` to count -- an empty/missing kb/ is no-KB mode too, never a crash.
 * @invariant T2 gates `ask_question` (E_KB_MISSING) -- computed ONCE at
 *   server startup (server.ts), not per-request, since KB presence doesn't
 *   change within a session's lifetime under this MVP's assumptions
 */
export async function detectNoKbMode(kb: KbAccess, config: Config): Promise<boolean> {
  if (config.kbDir === null) return true;
  const indexPath = `${config.kbDir}/INDEX.md`;
  return (await kb.readFile(indexPath)) === null;
}

export function makeFsKbAccess(repoRoot: string): KbAccess {
  return {
    async readFile(relPath: string): Promise<string | null> {
      const absolute = resolveRepoPath(repoRoot, relPath);
      try {
        return await fs.readFile(absolute, "utf8");
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "ENOENT"
        ) {
          return null;
        }
        throw error;
      }
    },
  };
}

const HEADING_LINE = /^#{1,6}\s+(.*)$/;
// Matches a property/edge-case ID ANYWHERE in a heading line (unlike the
// exact-shape test below, which validates a candidate ID string on its
// own) -- algorithms.md: "an ID is *declared* when \b(P|NF|T)\d+\b appears
// in a heading of that file."
const PROPERTY_ID_IN_TEXT = /\b(?:P|NF|T)\d+\b/g;

// Re-exported so existing server-side callers (validate/citation.ts) don't
// need an extra import line -- see shared/src/heading-slug.ts's header for
// why the slugging algorithm lives in `shared` (packages/web's KB viewer
// needs the IDENTICAL slugs to render matching heading `id` attributes).
export { headingSlugsOf as headingSlugs } from "@backbrief/shared";

// ADR-001 (plan step 1 gap): `declaresPropertyId` moved to @brief/core
// -- KbCitation validation (core's own) is the thing that calls it, and it
// depends on nothing backbrief-specific (only `isPropertyIdAnchor`, shared).
// Re-exported here so this package's own callers/tests keep their original
// import path.
export { declaresPropertyId } from "@brief/core";

/**
 * @returns every property/edge-case ID declared by a heading in `markdown`,
 *   in document order, deduplicated -- GET /api/kb's "property IDs" field
 *   (kb/plan.md step 2: "frontmatter + anchors + property IDs").
 */
export function declaredPropertyIds(markdown: string): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const line of markdown.split(/\r\n|\r|\n/)) {
    if (!HEADING_LINE.test(line)) continue;
    for (const match of line.matchAll(PROPERTY_ID_IN_TEXT)) {
      if (!seen.has(match[0])) {
        seen.add(match[0]);
        ids.push(match[0]);
      }
    }
  }
  return ids;
}

// Re-exported so existing server-side callers (validate/citation.ts) don't
// need an extra import line -- see shared/src/kb-anchor.ts's header for why
// the SHAPE test lives in `shared` (the pure reader-state fold needs it too).
export { isPropertyIdAnchor } from "@backbrief/shared";
