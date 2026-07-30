// Component: KbRefHoverCard -- the Code activity's kb-reference hover
// card: the KB file's `summary` frontmatter + the anchored section's first
// lines, fetched via the existing GET /api/kb (kb/plan.md step 3).
//
// Positioned as a fixed popover anchored to the hovered span's own DOM
// rect (passed in by CodeActivity.tsx, via CodeViewer's `onKbRefHover`) --
// Canvas.tsx's own header explains why this codebase generally prefers
// docking over floating-tooltip pixel chasing; a HOVER card specifically
// needs to track the mouse target, so this one small component is the
// deliberate exception rather than a reason to add a general floating-
// tooltip mechanism.
// Security/freshness note: this performs a live GET /api/kb fetch, so a
// span pointing outside `config.kbDir` (or at a file that no longer
// exists) 404s here exactly like BrowsePane's old KB routing did -- no new
// trust boundary, see shared/kb-ref.ts's own module header.
import { useEffect, useState } from "react";
import { fetchKb, type KbFile } from "../lib/browse-api";
import { kbRefPreview } from "../lib/kb-ref-preview";
import { describeError } from "../lib/error-ui";
import type { ApiConfig } from "../lib/api";
import type { KbRefSpan } from "@backbrief/shared/browser";

export function KbRefHoverCard({
  api,
  span,
  anchorRect,
}: {
  api: ApiConfig;
  span: KbRefSpan;
  /** The hovered `.cm-kbref` element's own `getBoundingClientRect()` -- read once by the caller at hover-enter time (DOMRect is a plain snapshot, not a live-tracking object). */
  anchorRect: DOMRect;
}): React.JSX.Element {
  const [kb, setKb] = useState<KbFile | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    setKb(null);
    setError(null);
    fetchKb(api, span.path)
      .then((file) => {
        if (!cancelled) setKb(file);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e);
      });
    return () => {
      cancelled = true;
    };
  }, [api, span.path]);

  const style: React.CSSProperties = {
    position: "fixed",
    top: anchorRect.bottom + 4,
    left: anchorRect.left,
  };
  const summary = kb ? kb.frontmatter["summary"] : undefined;

  return (
    <div className="kbref-hovercard" style={style} role="tooltip" data-testid="kbref-hovercard">
      <div className="kbref-hovercard-head">
        <b>{span.path}</b>
        {span.anchor && <span> · {span.anchor}</span>}
      </div>
      {error !== null && <p className="kbref-hovercard-error">{describeError(error).text}</p>}
      {kb && (
        <>
          {typeof summary === "string" && <p className="kbref-hovercard-summary">{summary}</p>}
          <pre className="kbref-hovercard-preview">
            {kbRefPreview(kb.content, span.anchor) || "(section not found)"}
          </pre>
        </>
      )}
    </div>
  );
}
