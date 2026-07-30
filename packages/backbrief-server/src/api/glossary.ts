// Module: api/glossary -- GET /api/glossary.
//
// Implements kb/spec/api-contracts.md's row: "round-7: {terms: [...]}
// parsed from kb/GLOSSARY.md's **Term** -- ... entries; {terms: []} in
// no-KB/no-glossary mode." Deliberately reads via the SAME KbAccess-backed
// path api/kb.ts already uses (SECURITY: no new unguarded fs read is
// introduced -- `deps.kb.readFile` resolves through `resolveRepoPath`/
// fsguard.ts, the one KB-reading code path this codebase has, kb-access.ts's
// own header explains why a second one would be a drift risk). The path
// itself is server-constructed from the trusted `config.kbDir` (never a
// client-supplied query param the way api/kb.ts's `path` is), so unlike
// that route this one needs no `isWithinKbDir` containment check of its own.
import type { Context } from "hono";
import { parseGlossary } from "@backbrief/shared";
import type { KbAccess } from "../kb-access";
import type { Config } from "../store/config";

export interface GlossaryRouteDeps {
  kb: KbAccess;
  config: Config;
  /** T2-style detection, computed once at startup (server.ts) -- reused
   *  here rather than re-deriving `kbDir === null` locally. */
  noKbMode: boolean;
}

/**
 * @returns `{terms: GlossaryTerm[]}` -- an empty array (never an error) in
 *   no-KB mode OR when the KB exists but carries no GLOSSARY.md. Unlike
 *   `ask_question`'s `E_KB_MISSING` (T2), a missing glossary is not an
 *   error the agent must react to -- it is the documented degraded shape
 *   (api-contracts.md), so the UI simply renders "no terms" rather than an
 *   error banner.
 */
export function glossaryRoute(deps: GlossaryRouteDeps) {
  return async (c: Context): Promise<Response> => {
    const kbDir = deps.config.kbDir;
    // `noKbMode` (T2) already implies `kbDir === null` OR a missing
    // INDEX.md -- the explicit `kbDir === null` re-check is defensive
    // narrowing for the compiler (`Config.kbDir` is `string | null`), not a
    // second source of truth: whenever `noKbMode` is false, `detectNoKbMode`
    // (kb-access.ts) has already proven `kbDir` is non-null.
    if (deps.noKbMode || kbDir === null) return c.json({ terms: [] });
    const content = await deps.kb.readFile(`${kbDir}/GLOSSARY.md`);
    if (content === null) return c.json({ terms: [] });
    return c.json({ terms: parseGlossary(content) });
  };
}
