// Module: lib/kb-ref-decorations -- pure construction of CM6 inline mark
// decorations for GET /api/file's `kbReferences` spans (shared/kb-ref.ts).
//
// kb/plan.md step 3's Code activity: "comments citing kb/ paths become
// links... hover card." Marks each span with `.cm-kbref` (styled as a link,
// styles.css) and a `data-kbref-index` attribute pointing back into the
// ORIGINAL spans array -- CodeViewer.tsx's delegated mouseover/mouseout
// handler reads that index off the DOM event target to know which span is
// being hovered, without re-parsing text or touching CM6 internals.
// Mirrors lib/citation-decorations.ts's split exactly (pure range builder +
// thin StateField wrapper) but with `Decoration.mark` (inline), not
// `Decoration.line` -- a kb reference is a SPAN within a line, not a whole line.
import { RangeSetBuilder } from "@codemirror/state";
import type { EditorState } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";
import { StateField } from "@codemirror/state";
import type { KbRefSpan } from "@backbrief/shared/browser";

/** The exact matched-text length a span covers -- KbRefSpan itself carries
 *  no length (shared/kb-ref.ts keeps the wire shape minimal); reconstructed
 *  from `path`/`anchor` since the detector's own pattern is always
 *  `path[#anchor]` with no characters in between. */
function spanLength(span: KbRefSpan): number {
  return span.path.length + (span.anchor !== undefined ? 1 + span.anchor.length : 0);
}

/**
 * @param state the document the spans apply to -- a span whose `line` falls
 *   outside `1..state.doc.lines`, or whose `col` lands past the line's own
 *   end, is silently skipped (P1's "flagged, never a crash" rendering
 *   philosophy: a stale span from a since-edited worktree file must not
 *   break the viewer)
 * @invariant CM6 requires decorations added in ascending position order --
 *   this function sorts before building
 */
export function buildKbRefDecorations(
  state: EditorState,
  spans: readonly KbRefSpan[],
): DecorationSet {
  const marks: { pos: number; to: number; deco: Decoration }[] = [];
  spans.forEach((span, index) => {
    if (span.line < 1 || span.line > state.doc.lines) return;
    const line = state.doc.line(span.line);
    const from = Math.min(line.to, line.from + Math.max(0, span.col));
    const to = Math.min(line.to, from + spanLength(span));
    if (to <= from) return;
    marks.push({
      pos: from,
      to,
      deco: Decoration.mark({
        class: "cm-kbref",
        attributes: { "data-kbref-index": String(index) },
      }),
    });
  });
  marks.sort((a, b) => a.pos - b.pos);
  const builder = new RangeSetBuilder<Decoration>();
  for (const mark of marks) builder.add(mark.pos, mark.to, mark.deco);
  return builder.finish();
}

/**
 * A StateField wrapping `buildKbRefDecorations`, computed once at document
 * creation -- CodeViewer.tsx rebuilds the WHOLE EditorState (not just this
 * field) whenever `kbRefs` changes, same rationale as citation-
 * decorations.ts's `citationHighlightField`.
 */
export function kbRefField(initialSpans: readonly KbRefSpan[]) {
  return StateField.define<DecorationSet>({
    create: (state) => buildKbRefDecorations(state, initialSpans),
    update: (decorations) => decorations,
    provide: (field) => EditorView.decorations.from(field),
  });
}
