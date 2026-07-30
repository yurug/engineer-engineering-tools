// Module: lib/kb-ref-preview -- pure extraction of "the anchored section's
// first lines" (or the file's first lines with no anchor) for
// KbRefHoverCard.tsx's preview (kb/plan.md step 3).
//
// Reuses shared's OWN `githubHeadingSlug` algorithm -- the SAME one GET
// /api/kb's `anchors` list and KbViewer.tsx's heading `id` injection
// already use (heading-slug.ts's own header: "One algorithm, two
// consumers") -- so "does this anchor exist, and where" never disagrees
// with the rest of the KB-rendering pipeline. This is a THIRD consumer of
// that one algorithm, not a fourth independent slugger.
import { githubHeadingSlug } from "@backbrief/shared/browser";

const PREVIEW_LINE_COUNT = 4;
const HEADING_LINE = /^#{1,6}\s+(.*)$/;

/**
 * @param content the KB file's raw markdown BODY (frontmatter already
 *   stripped -- GET /api/kb's own contract)
 * @param anchor the span's `#anchor`, if any; omitted means "the file's own
 *   first lines" (no section to seek)
 * @returns up to `PREVIEW_LINE_COUNT` lines right after the matching
 *   heading, or "" if an anchor was given but no heading slugs to it --
 *   the caller renders an honest "section not found" for that case rather
 *   than silently falling back to the whole file (a stale citation must
 *   stay flagged, not quietly substitute different content, P1's spirit)
 */
export function kbRefPreview(content: string, anchor: string | undefined): string {
  const lines = content.split(/\r\n|\r|\n/);
  if (anchor === undefined) return lines.slice(0, PREVIEW_LINE_COUNT).join("\n").trim();
  const seenCounts = new Map<string, number>();
  for (const [index, line] of lines.entries()) {
    const match = HEADING_LINE.exec(line);
    if (!match?.[1]) continue;
    const slug = githubHeadingSlug(match[1], seenCounts);
    if (slug === anchor) {
      return lines
        .slice(index + 1, index + 1 + PREVIEW_LINE_COUNT)
        .join("\n")
        .trim();
    }
  }
  return "";
}
