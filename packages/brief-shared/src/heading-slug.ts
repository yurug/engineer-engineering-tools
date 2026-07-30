// Module: heading-slug -- GitHub-style markdown heading slugging.
//
// Implements kb/spec/algorithms.md#kbcitation-validation's anchor rule
// exactly: "GitHub-style slugging: lowercase, strip punctuation,
// spaces->hyphens, -N suffix on duplicates." Promoted to `shared` (step 2)
// from server/src/kb-access.ts (which still owns the fs-backed KB reading
// and re-exports these two functions for its own callers) because the KB
// VIEWER (packages/web) must inject the SAME heading `id` attributes into
// its rendered markdown that `GET /api/kb`'s `anchors` list already
// computed server-side -- two independently-drifting slug algorithms would
// make "jump to anchor" silently break the moment they disagreed on one
// heading. One algorithm, two consumers.
const HEADING_LINE = /^#{1,6}\s+(.*)$/;

/**
 * GitHub-style slug: lowercase, strip punctuation, spaces -> hyphens, a
 * `-N` suffix (N starting at 1) on the 2nd+ occurrence of the same base
 * slug -- `seenCounts` accumulates across a whole document, so pass the
 * SAME map instance across an ordered walk of a file's headings.
 */
export function githubHeadingSlug(heading: string, seenCounts: Map<string, number>): string {
  const base = heading
    .toLowerCase()
    .replace(/[^\w\- ]+/g, "")
    .trim()
    .replace(/\s+/g, "-");
  const priorCount = seenCounts.get(base) ?? 0;
  seenCounts.set(base, priorCount + 1);
  return priorCount === 0 ? base : `${base}-${priorCount}`;
}

/** @returns every heading's GitHub-style slug found in `markdown`, in document order. */
export function headingSlugsOf(markdown: string): Set<string> {
  const seenCounts = new Map<string, number>();
  const slugs = new Set<string>();
  for (const line of markdown.split(/\r\n|\r|\n/)) {
    const match = HEADING_LINE.exec(line);
    if (match?.[1] !== undefined) slugs.add(githubHeadingSlug(match[1], seenCounts));
  }
  return slugs;
}
