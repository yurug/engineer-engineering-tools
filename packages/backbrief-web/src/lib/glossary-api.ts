// Module: lib/glossary-api -- GET client for GET /api/glossary (US15,
// ADR-007 decision 4).
//
// Mirrors lib/browse-api.ts's `getJson` shape but stays its OWN tiny module
// (like lib/talk-api.ts) rather than growing browse-api.ts further -- kb/
// conventions/code-style.md's size budget, and this endpoint has exactly
// one shape to defend: api-contracts.md's `{terms: [...]}` degrades to
// `{terms: []}` in no-KB/no-glossary mode, NEVER an error -- so the only
// resilience this needs is "a malformed/missing `terms` field still yields
// an array," not full ApiClientError taxonomy handling.
import type { ApiConfig } from "./api";
import type { GlossaryTerm } from "@backbrief/shared/browser";

function authHeaders(config: ApiConfig): Record<string, string> {
  return { Authorization: `Bearer ${config.humanToken}` };
}

/**
 * @returns the repo's glossary terms, or `[]` on ANY failure (network error,
 *   non-OK response, a body missing `terms`) -- api-contracts.md: "a missing
 *   glossary is not an error the agent must react to... the UI simply
 *   renders 'no terms.'" The SAME degrade-silently contract applies to a
 *   client-side fetch failure, not just the server's own no-KB branch: a
 *   glossary card is progressive enhancement, never a blocking dependency.
 */
export async function fetchGlossary(config: ApiConfig): Promise<GlossaryTerm[]> {
  try {
    const res = await fetch(`${config.httpOrigin}/api/glossary`, { headers: authHeaders(config) });
    if (!res.ok) return [];
    const body = (await res.json()) as { terms?: unknown };
    return Array.isArray(body.terms) ? (body.terms as GlossaryTerm[]) : [];
  } catch {
    return [];
  }
}
