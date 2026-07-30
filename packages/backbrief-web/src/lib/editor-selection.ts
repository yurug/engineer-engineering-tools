// Module: lib/editor-selection -- pure offset-selection -> 1-based line
// range conversion, CodeViewer's "annotate this selection" feature; also
// `selectionInfo()`, which adds the selection's screen rect so a caller
// can anchor a popover NEXT TO the selection instead of docking a panel
// at the bottom of the scroll area (2026-07-19 dogfood: on a long file,
// the old docked SelectionContextMenu forced "select near the top, then
// scroll all the way down to write the note" -- see SelectionContextMenu
// .tsx's own header for the placement decision this feeds, and
// lib/popover-position.ts for the pure below/above/clamp math).
//
// kb/external/codemirror6.md: "positions are character offsets... doc.line
// is 1-based, matching our citations" -- this is the one conversion point
// so a citation built from a CM6 selection always uses the same 1-based
// convention CodeCitation itself uses (data-model.md).
import type { EditorState } from "@codemirror/state";
import type { EditorView, Rect } from "@codemirror/view";

/** @returns the 1-based [startLine, endLine] the current selection spans, or null for an empty (collapsed) selection. */
export function selectionToLineRange(state: EditorState): [number, number] | null {
  const range = state.selection.main;
  if (range.empty) return null;
  return [state.doc.lineAt(range.from).number, state.doc.lineAt(range.to).number];
}

/** Line range + screen anchor for the current selection -- what CodeViewer's `onSelectionChange` now reports. */
export interface SelectionInfo {
  /** 1-based [startLine, endLine], same convention as `selectionToLineRange`. */
  lines: [number, number];
  /** Screen-space rect anchoring the selection's END (`view.coordsAtPos(range.head)`) -- a caret-sized rect wherever the user finished selecting/dragging, which reads as "about what I just selected" better than the selection's start would. Null when CM6 cannot resolve coordinates (see this function's own doc). */
  anchorRect: Rect | null;
}

/**
 * @param view the LIVE EditorView -- unlike `selectionToLineRange`, this needs actual layout (`coordsAtPos` measures the DOM), so it cannot be pure over `EditorState` alone; callers get it from CM6's own `updateListener` (`update.view`).
 * @returns null for an empty selection (nothing to annotate); otherwise the 1-based line range plus a best-effort anchor rect
 * @invariant P1 -- `coordsAtPos` requires DOM text-measurement APIs
 *   (`Range.getClientRects`) that some environments (jsdom, in this
 *   repo's component tests) don't implement. A measurement failure
 *   degrades to `anchorRect: null` rather than throwing out of CM6's
 *   update listener -- which would break selection handling entirely --
 *   for what is, at worst, a slightly-worse popover position
 *   (SelectionContextMenu.tsx falls back to a fixed top-left-ish anchor).
 */
export function selectionInfo(view: EditorView): SelectionInfo | null {
  const lines = selectionToLineRange(view.state);
  if (lines === null) return null;
  let anchorRect: Rect | null;
  try {
    anchorRect = view.coordsAtPos(view.state.selection.main.head);
  } catch {
    anchorRect = null;
  }
  return { lines, anchorRect };
}
