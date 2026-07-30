// Module: lib/code-nav -- the ONE cross-tab navigation target every
// clickable citation (and every glossary term's "jump to definition" link)
// resolves to: "open this path in the Code tab, at this line or anchor."
//
// kb/plan.md R7-3: "every rendered citation (file:line in briefs, devices,
// talk slides, move cards) becomes a link that opens that file in the Code
// tab at the line." Before this step, CitationStrip/MapNodeCard/MoveBrief's
// evidence list rendered `citationLocationLabel`'s "path:line" text as inert
// text (styles.css's own retired `.cite` chip documents this was ALREADY
// true for the old Canvas.tsx: "no current caller populates it with real
// specs" -- so this is not a regression, it is the first real wiring). App.tsx
// owns the one piece of cross-cutting state a click needs (`tab`, and
// CodeActivity's open file) -- this module is the PURE shape both ends
// agree on, so App.tsx, CitationStrip.tsx, MapNodeCard.tsx, and
// GlossaryTermCard.tsx never have to hand-roll "code citation vs kb
// citation" branching a second time (CitationStrip's own citationLocationLabel,
// lib/citation-view.ts, already drew that exact line -- this mirrors it).
import type { Citation, CitationInput } from "@backbrief/shared/browser";

/** Where to land: a code file (optionally at a 1-based line) or a KB file
 *  (optionally at a heading anchor) -- CodeActivity.tsx routes `.md` paths
 *  through KbViewer (`anchor`) and everything else through CodeViewer
 *  (`line`), exactly like lib/use-open-path.ts's existing kb-vs-code split. */
export interface CodeNavTarget {
  path: string;
  line?: number;
  anchor?: string;
}

/**
 * A nav REQUEST additionally carries a `nonce`, bumped on every click --
 * CodeViewer's/KbViewer's own jump effects are keyed on prop IDENTITY
 * (`jumpToLine`/`jumpToAnchor` changing), so clicking the SAME citation
 * twice in a row (e.g. re-confirming where a badge points) would otherwise
 * be a no-op the second time: the target value hasn't changed, so no effect
 * re-fires and the viewer doesn't re-scroll. The nonce makes every click its
 * own request, once again mirroring CodeViewer.tsx's own FIX 4 precedent
 * (its module header: a jump must survive being requested twice for the
 * same target).
 */
export interface CodeNavRequest extends CodeNavTarget {
  nonce: number;
}

/**
 * @param citation either shape the app renders (data-model.md's `CodeCitation`/
 *   `KbCitation`, minted or not -- both carry the same `kind` discriminant)
 * @returns the nav target for that citation: a code citation's `startLine`
 *   (not `endLine` -- "at the line" means where the cited evidence BEGINS,
 *   matching CodeViewer's own single-line `scrollToLine` contract) or a KB
 *   citation's `anchor`
 */
export function citationNavTarget(citation: Citation | CitationInput): CodeNavTarget {
  if (citation.kind === "code") return { path: citation.path, line: citation.startLine };
  return { path: citation.path, anchor: citation.anchor };
}
