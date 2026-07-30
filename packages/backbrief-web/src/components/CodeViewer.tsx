// Component: CodeViewer -- read-only CodeMirror 6 viewer.
//
// kb/external/codemirror6.md: read-only is a config, not a mode. We use
// EditorState.readOnly.of(true) ALONE (not editable:false) so the viewer
// stays selectable for "annotate this region" -- see the extensions block.
// Implements citation highlights (Decoration-based, via
// lib/citation-decorations.ts), inline agent-explanation block widgets
// (lib/callout-widgets.ts -- FIX 3: an explanation mounts INLINE, right
// after the lines it's about, inside this SAME scroll region, rather than
// stacking below an editor that used to scroll independently of the rest
// of the canvas), jump-to-line (`scrollToLine`), plain-text fallback (P10
// -- lib/language-cm6.ts already degrades an unrecognized language to
// `[]`, so no branching is needed HERE), and selection tracking for
// "annotate this region" (lib/editor-selection.ts). Selection reports now
// carry a screen anchor rect alongside the line range (2026-07-19
// dogfood fix: the composer used to dock at the bottom of the scroll
// area, forcing "select near the top, scroll all the way down to write
// the note" -- CodeActivity.tsx now floats it next to the selection via
// this rect, SelectionContextMenu.tsx's own header has the placement
// decision).
// Key design decision: the WHOLE EditorState is recreated (`new
// EditorState.create(...)`) whenever content/language/highlights/
// calloutWidgets change, rather than dispatching incremental transactions
// -- this is a read-only viewer swapping between independent files, not an
// editor tracking one document's edit history, so there is no meaningful
// "diff" between two states to transact through.
// FIX 3, the other half (styles.css): this component no longer scrolls on
// its own -- `.code-viewer` sizes to its content and CM6's `.cm-scroller`
// only auto-scrolls horizontally by default, so removing our own
// height:100%/overflow:auto override is enough to make Canvas.tsx's
// `.canvas-scroll` the single scroll region for the whole canvas (CM6's
// documented "content determines height, an ancestor scrolls" mode).
//
// FIX 4 root cause (dogfood 2026-07-13: "il ouvre bien le fichier, par
// contre il ne scrolle pas l'éditeur à la bonne position"): the OLD code
// had exactly one effect keyed on `[jumpToLine]` that dispatched the
// scroll, entirely separate from the effect that (re)creates the
// EditorView. Clicking a citation in a DIFFERENT file changes `viewCitation`
// (Canvas.tsx) synchronously, so `jumpToLine` updates in the SAME render
// that still holds the OLD file's `content` (the new file is still being
// fetched) -- the jump effect fires immediately, against the OLD document,
// and is a no-op if the target line doesn't exist there. Once the fetch
// resolves and `content` changes, the recreate effect builds a BRAND NEW
// EditorView -- but the jump effect never re-fires, because `jumpToLine`
// itself hasn't changed since the render before: the scroll intent is
// silently lost. Fix: the recreate effect now ALSO scrolls to the
// (render-current) `jumpToLine` right after building the new view, so a
// fresh document always lands pre-scrolled; the standalone effect below
// still handles "same document, new target line" (revisiting a different
// citation in a file that's already open).
import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { defaultKeymap } from "@codemirror/commands";
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import type { KbRefSpan } from "@backbrief/shared/browser";
import { languageExtension } from "../lib/language-cm6";
import { citationHighlightField, type HighlightRange } from "../lib/citation-decorations";
import { calloutWidgetField, type CalloutWidgetSpec } from "../lib/callout-widgets";
import { kbRefField } from "../lib/kb-ref-decorations";
import { selectionInfo, type SelectionInfo } from "../lib/editor-selection";

/**
 * @param view the (already-mounted) EditorView to scroll
 * @param line 1-based target line -- out-of-range values (a stale/relocated
 *   citation, or a target past a just-swapped-in shorter document) are
 *   silently ignored rather than thrown (matches P1's "flagged, never a
 *   crash" rendering philosophy elsewhere in this codebase)
 * @invariant idempotent -- calling this twice with the same (view, line) is
 *   harmless, so it's safe for both the recreate effect and the standalone
 *   jump effect to call it in the same render without double-jump bugs
 */
function scrollToLine(view: EditorView, line: number): void {
  if (line < 1 || line > view.state.doc.lines) return;
  const pos = view.state.doc.line(line).from;
  view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: "center" }) });
}

// Step 3 bugfix: module-level (stable-identity) empty-array defaults --
// `highlights = []` as a parameter default creates a BRAND NEW array every
// time the component renders with that prop omitted, which the recreate
// effect below (dependency array includes `highlights`/`calloutWidgets`/
// `kbRefs`) sees as "changed" on EVERY parent re-render, tearing down and
// rebuilding the whole EditorView pointlessly (losing scroll position/
// selection) even when nothing about the document actually changed. Every
// PRE-existing caller (Canvas.tsx) happened to always pass both props
// explicitly, so this never manifested; components/CodeActivity.tsx (step
// 3) is the first caller that omits them, and hit it immediately --
// EVERY hover (CodeActivity's own re-render) was rebuilding the editor and
// invalidating the just-hovered DOM node. Fixed at the root (a stable
// default), not papered over at the new call site.
const EMPTY_HIGHLIGHTS: HighlightRange[] = [];
const EMPTY_CALLOUT_WIDGETS: CalloutWidgetSpec[] = [];
const EMPTY_KB_REFS: KbRefSpan[] = [];

export interface CodeViewerProps {
  content: string;
  /** LanguageTag string from GET /api/file's response (shared/src/language.ts). */
  language: string;
  highlights?: HighlightRange[];
  /** Agent callouts / human annotations to mount INLINE, right after the lines they're about (FIX 3, lib/callout-widgets.ts). */
  calloutWidgets?: CalloutWidgetSpec[];
  /** Step 3 (kb/plan.md): GET /api/file's detected "kb/....md[#anchor]" spans -- rendered as inline `.cm-kbref` marks (lib/kb-ref-decorations.ts). */
  kbRefs?: KbRefSpan[];
  /** Fires on hover-enter of a `.cm-kbref` span (with the span + its DOM element, for the caller's hover-card positioning) and on hover-leave (`null, null`) -- a plain delegated mouseover/mouseout on this component's own container, not a CM6-internal event, so the caller (components/CodeActivity.tsx) never touches CM6 itself. */
  onKbRefHover?: (span: KbRefSpan | null, target: HTMLElement | null) => void;
  /** 1-based line to scroll into view on mount/change -- citation "jump to line". */
  jumpToLine?: number;
  /** Fires on every selection change; null for a collapsed selection ("nothing to annotate"). Includes the selection's screen anchor rect (lib/editor-selection.ts's `selectionInfo`) so a caller can float a popover NEXT TO the selection rather than docking a panel elsewhere. */
  onSelectionChange?: (selection: SelectionInfo | null) => void;
}

export function CodeViewer({
  content,
  language,
  highlights = EMPTY_HIGHLIGHTS,
  calloutWidgets = EMPTY_CALLOUT_WIDGETS,
  kbRefs = EMPTY_KB_REFS,
  onKbRefHover,
  jumpToLine,
  onSelectionChange,
}: CodeViewerProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const state = EditorState.create({
      doc: content,
      extensions: [
        lineNumbers(),
        keymap.of(defaultKeymap), // arrow/page navigation still works in a read-only doc -- selection for annotation needs it
        // readOnly blocks edits; we deliberately DO NOT set editable:false.
        // editable:false makes CM's content contenteditable=false, and then
        // CM stops syncing mouse selection into EditorState -- so
        // `selectionSet` never fires and "annotate this region" is dead
        // (dogfood bug 2026-07-12). readOnly:true alone gives a fully
        // selectable-but-unmodifiable viewer, which is what we want.
        EditorState.readOnly.of(true),
        // Syntax colours need a HighlightStyle -- the language extension only
        // builds the parse tree; without this nothing maps tokens to colour
        // (dogfood bug 2026-07-12: code rendered monochrome). `fallback: true`
        // also styles plain-text/unknown-grammar files' basic tokens.
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        ...languageExtension(language),
        citationHighlightField(highlights),
        calloutWidgetField(calloutWidgets),
        kbRefField(kbRefs),
        EditorView.updateListener.of((update) => {
          // `update.view`, not `update.state` -- selectionInfo() needs the
          // live view to resolve the selection's screen coordinates
          // (coordsAtPos), which a bare EditorState can't do.
          if (update.selectionSet) onSelectionChange?.(selectionInfo(update.view));
        }),
      ],
    });
    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;
    // FIX 4: scroll the FRESH view now, using this render's `jumpToLine`
    // (closed over here, not read from a stale ref) -- see this file's
    // header for why waiting on the standalone jump effect below to
    // "catch up" loses the jump entirely when content and jumpToLine
    // change across two different renders (the common case: a citation
    // click targets a NOT-yet-loaded file).
    if (jumpToLine !== undefined) scrollToLine(view, jumpToLine);
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // `onSelectionChange`/`onKbRefHover` are intentionally excluded from
    // this dependency list -- caller-supplied callbacks, not editor-
    // identity state; including them would tear down/rebuild the whole
    // EditorView (losing scroll position and selection) on every parent
    // re-render, which defeats the point of a stable read-only viewer.
  }, [content, language, highlights, calloutWidgets, kbRefs]);

  // Handles "same document, new target line" -- e.g. revisiting a
  // DIFFERENT citation in a file that's already open, where the effect
  // above never fires (content/language/highlights are unchanged). Runs
  // in addition to (not instead of) the recreate effect's own scroll --
  // scrollToLine is idempotent, so the harmless case where BOTH fire on
  // the same render (a brand new file whose first jumpToLine also happens
  // to differ from the previous file's) just scrolls twice to the same spot.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || jumpToLine === undefined) return;
    scrollToLine(view, jumpToLine);
  }, [jumpToLine]);

  // Step 3: delegated hover -- ONE pair of listeners on the container
  // (not one per `.cm-kbref` span) resolves the hovered element back to
  // its KbRefSpan via `data-kbref-index` (lib/kb-ref-decorations.ts sets
  // it). Plain React synthetic events, not a CM6 API -- CM6's own DOM
  // still bubbles native mouse events through this container normally.
  function handleMouseOver(event: React.MouseEvent<HTMLDivElement>): void {
    if (!onKbRefHover) return;
    const target = (event.target as HTMLElement).closest<HTMLElement>(".cm-kbref");
    if (!target) return;
    const span = kbRefs[Number(target.dataset.kbrefIndex)];
    if (span) onKbRefHover(span, target);
  }
  function handleMouseOut(event: React.MouseEvent<HTMLDivElement>): void {
    if (!onKbRefHover) return;
    const from = (event.target as HTMLElement).closest(".cm-kbref");
    if (!from) return;
    // A leave that lands on a DESCENDANT still inside the same span (e.g. a
    // nested text node boundary) is not a real hover-exit -- only clear
    // when the related target is outside `.cm-kbref` entirely.
    const to = (event.relatedTarget as HTMLElement | null)?.closest(".cm-kbref");
    if (to) return;
    onKbRefHover(null, null);
  }

  return (
    <div
      ref={containerRef}
      className="code-viewer"
      data-testid="code-viewer"
      onMouseOver={handleMouseOver}
      onMouseOut={handleMouseOut}
    />
  );
}
