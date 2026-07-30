// Component: KbViewer -- renders a KB file's frontmatter table + body.
//
// kb/plan.md step 2: "KB viewer (markdown-it per kb/external/markdown-
// rendering.md, frontmatter table, anchor targets)." Body rendering goes
// through lib/markdown.ts's `renderKbMarkdown` (same `html:false` security
// posture as card rendering, plus heading `id` injection matching `GET
// /api/kb`'s `anchors` list) -- this is the ONE other `dangerouslySetInnerHTML`
// call site in the web package besides Card.tsx, both funneling through
// the same audited lib/markdown.ts module (kb/external/markdown-
// rendering.md's audit note: "the only HTML injection point").
import { useEffect, useMemo, useRef } from "react";
import { renderKbMarkdown } from "../lib/markdown";
import type { KbFile } from "../lib/browse-api";

const HEADING_TAGS = new Set(["H1", "H2", "H3", "H4", "H5", "H6"]);

export function KbViewer({
  kb,
  jumpToAnchor,
  onSectionSelect,
}: {
  kb: KbFile;
  jumpToAnchor?: string;
  /** Fires with a heading's `id` (a GitHub slug, matching `kb.anchors`) when the reader clicks it -- BrowsePane uses this to target "annotate this KB section." */
  onSectionSelect?: (anchor: string) => void;
}): React.JSX.Element {
  const html = useMemo(() => renderKbMarkdown(kb.content), [kb.content]);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!jumpToAnchor || !bodyRef.current) return;
    // CSS.escape guards against an anchor containing characters that
    // would otherwise break the #id selector (property ids like "P4" are
    // safe, but a KB heading slug could in principle contain any
    // slug-shaped character) -- this component must not throw on a
    // pathological anchor, matching P1's "flagged, never a crash" spirit.
    const target = bodyRef.current.querySelector(`#${CSS.escape(jumpToAnchor)}`);
    target?.scrollIntoView({ block: "center" });
  }, [jumpToAnchor, html]);

  // Event delegation (one listener on the body, not one per heading) --
  // markdown-it output is replaced wholesale on every render (dangerouslySet
  // InnerHTML), so per-element React handlers would be re-attached every
  // time anyway; delegation is both simpler and cheaper here.
  function handleBodyClick(clickEvent: React.MouseEvent<HTMLDivElement>): void {
    if (!onSectionSelect) return;
    const target = clickEvent.target;
    if (!(target instanceof HTMLElement)) return;
    const heading = HEADING_TAGS.has(target.tagName) ? target : target.closest("h1,h2,h3,h4,h5,h6");
    if (heading instanceof HTMLElement && heading.id) onSectionSelect(heading.id);
  }

  return (
    <div className="kb-viewer" data-testid="kb-viewer">
      <FrontmatterTable frontmatter={kb.frontmatter} />
      {/* Safe by construction -- see module header. */}
      <div
        ref={bodyRef}
        className="kb-body"
        onClick={handleBodyClick}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

function FrontmatterTable({
  frontmatter,
}: {
  frontmatter: KbFile["frontmatter"];
}): React.JSX.Element | null {
  const entries = Object.entries(frontmatter);
  if (entries.length === 0) return null;
  return (
    <table className="kb-frontmatter" data-testid="kb-frontmatter">
      <tbody>
        {entries.map(([key, value]) => (
          <tr key={key}>
            <th>{key}</th>
            <td>{Array.isArray(value) ? value.join(", ") : value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
