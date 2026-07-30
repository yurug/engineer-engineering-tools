// Component: AnnotationsInbox -- the returnable annotations panel (ADR-007:
// "annotations get their own returnable inbox, never hijacking the current
// brief"): every posted annotation, its citation as a link into Code, and
// any threaded agent reaction (lib/annotations-inbox.ts).
//
// Mounted by App.tsx as a SIBLING of the tab panels (a fixed top-right
// overlay, styles.css's `.annotations-inbox`), never as content inside
// SessionBrief -- this is the structural half of "never hijacking the
// current brief": posting an annotation while a brief is open cannot even
// render INTO that brief, because this component lives outside it entirely.
import { citationLocationLabel } from "../lib/citation-view";
import { citationNavTarget, type CodeNavTarget } from "../lib/code-nav";
import { findAnnotationReactions } from "../lib/annotations-inbox";
import type { AnnotationView } from "../lib/browse-api";
import type { Envelope } from "@backbrief/shared/browser";

export function AnnotationsInbox({
  annotations,
  envelopes,
  onOpenCitation,
  onClose,
}: {
  annotations: readonly AnnotationView[];
  /** For `findAnnotationReactions` -- the full live stream (App.tsx's own `envelopes`). */
  envelopes: readonly Envelope[];
  onOpenCitation: (target: CodeNavTarget) => void;
  onClose: () => void;
}): React.JSX.Element {
  return (
    <aside
      className="annotations-inbox"
      role="dialog"
      aria-label="Annotations inbox"
      data-testid="annotations-inbox"
    >
      <div className="annotations-inbox-head">
        <span>Annotations</span>
        <button type="button" onClick={onClose} aria-label="Close annotations inbox">
          ×
        </button>
      </div>
      {annotations.length === 0 ? (
        <p className="annotations-inbox-empty">No annotations yet.</p>
      ) : (
        <ul className="annotations-inbox-list">
          {annotations.map((annotation) => {
            const reactions = findAnnotationReactions(envelopes, annotation.annotationId);
            return (
              <li
                key={annotation.annotationId}
                className={`annotations-inbox-item${annotation.archived ? " annotations-inbox-item-archived" : ""}`}
              >
                <button
                  type="button"
                  className="citation-link"
                  onClick={() => onOpenCitation(citationNavTarget(annotation.citation))}
                >
                  {citationLocationLabel(annotation.citation)}
                </button>
                <p className="annotations-inbox-text">{annotation.text}</p>
                {reactions.length > 0 && (
                  <ul className="annotations-inbox-reactions">
                    {reactions.map((reaction) => (
                      <li key={reaction.envelopeId}>{reaction.text}</li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
