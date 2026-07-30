// Module: lib/citation-decorations -- pure construction of CM6 line
// decorations from citation/highlight line ranges.
//
// kb/external/codemirror6.md: "Decorations (Decoration.mark/line) are the
// mechanism for citation highlights, drift badges, and annotation
// gutters; they must be provided through a StateField." Split into a pure
// range-building function (unit-testable against a real `EditorState`,
// no rendering needed) plus a thin StateField wrapper CodeViewer.tsx
// installs -- kb/conventions/testing-strategy.md's unit level applies
// even though the OUTPUT type (DecorationSet) is a CM6 type, because
// building it needs no DOM.
import { RangeSetBuilder } from "@codemirror/state";
import type { EditorState } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";
import { StateField } from "@codemirror/state";

export interface HighlightRange {
  startLine: number;
  endLine: number;
  /** CSS class applied to every line in the range -- see src/styles.css's `.cm-citation-*` rules. */
  className: string;
}

/**
 * @param state the document the ranges apply to -- lines outside
 *   `1..state.doc.lines` are silently skipped (a stale/relocated citation
 *   pointing past the current doc must never crash the viewer, matching
 *   P1's "flagged, never a crash" rendering philosophy elsewhere)
 * @returns a DecorationSet with one line-class decoration per covered line
 * @invariant CM6 requires decorations added in ascending position order --
 *   this function sorts before building, so callers never need to
 */
export function buildLineDecorations(
  state: EditorState,
  ranges: readonly HighlightRange[],
): DecorationSet {
  const marks: { pos: number; deco: Decoration }[] = [];
  for (const range of ranges) {
    const start = Math.max(1, range.startLine);
    const end = Math.min(state.doc.lines, range.endLine);
    for (let lineNumber = start; lineNumber <= end; lineNumber++) {
      marks.push({
        pos: state.doc.line(lineNumber).from,
        deco: Decoration.line({ class: range.className }),
      });
    }
  }
  marks.sort((a, b) => a.pos - b.pos);
  const builder = new RangeSetBuilder<Decoration>();
  for (const mark of marks) builder.add(mark.pos, mark.pos, mark.deco);
  return builder.finish();
}

/**
 * A StateField wrapping `buildLineDecorations`, computed once at document
 * creation. CodeViewer.tsx rebuilds the WHOLE EditorState (not just this
 * field) whenever `highlights` changes -- the read-only viewer never
 * needs a live-updating decoration field, so a static create() is enough
 * and avoids a second reconfiguration mechanism.
 */
export function citationHighlightField(initialRanges: readonly HighlightRange[]) {
  return StateField.define<DecorationSet>({
    create: (state) => buildLineDecorations(state, initialRanges),
    update: (decorations) => decorations,
    provide: (field) => EditorView.decorations.from(field),
  });
}
