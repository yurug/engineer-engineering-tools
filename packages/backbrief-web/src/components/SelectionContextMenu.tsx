// Component: SelectionContextMenu -- the Code activity's region-scoped
// action menu, replacing BrowsePane's old `browse-side-panel` forms
// (AnnotateForm/ImpressionForm/QuestionPanel/UnderstoodControls) for CODE
// selections. docs/design/redesign-mockup.html: "when the user selects a
// code region, show a small popover ... Annotate / Ask about this / Mark
// understood / Contest."
//
// PLACEMENT (2026-07-19 dogfood fix): this used to render as a toolbar
// DOCKED at the bottom of the scroll area -- on a long file that forced
// "select near the top, then scroll all the way down to write the note."
// The original comment here argued docking was "more robust than chasing
// CodeMirror's pixel coordinates"; that tradeoff is no longer worth it --
// we now float as a `position: fixed` popover anchored to the selection's
// own screen rect, mirroring KbRefHoverCard.tsx's precedent (a fixed
// popover positioned from a caller-supplied `getBoundingClientRect()`
// snapshot) plus a viewport-aware below/above/clamp placement
// (lib/popover-position.ts, pure and unit-tested WITHOUT real DOM layout
// -- jsdom doesn't implement one, kb/external/codemirror6.md). Robustness
// concern the old comment was protecting against -- a stale anchor after
// the user scrolls/resizes -- is handled by the CALLER (CodeActivity.tsx
// closes this menu on scroll/resize of the code area) rather than by this
// component trying to keep a live-tracking rect: closing is simpler and
// still correct (P1: never show something in the wrong place), and the
// selection itself stays visible in CM6 so reopening is one more
// select-drag away.
// Every action below calls the SAME postAnnotation/postHumanEvent paths the
// retired forms used -- no new protocol surface, just a different (and
// more discoverable) place to trigger them from.
import { useLayoutEffect, useRef, useState } from "react";
import type { CodeCitationInput } from "@backbrief/shared/browser";
import { postHumanEvent } from "../lib/browse-api";
import { postAnnotation, type ApiConfig } from "../lib/api";
import { citationLocationLabel } from "../lib/citation-view";
import { submitOnCtrlEnter } from "../lib/submit-on-ctrl-enter";
import { placePopover, type PlacementRect } from "../lib/popover-position";

/** Anchor used when the selection has no resolvable screen rect (lib/editor-selection.ts's `selectionInfo` returning `anchorRect: null`, e.g. a jsdom test or a coordsAtPos failure) -- a degenerate zero-sized rect near the viewport's top-left, which `placePopover` (P1) still turns into a valid on-screen position rather than crashing or rendering off-screen. */
const FALLBACK_ANCHOR: PlacementRect = { top: 0, bottom: 0, left: 0, right: 0 };

type Mode = "menu" | "annotate" | "ask" | "contest";

function placeholderFor(mode: Mode): string {
  switch (mode) {
    case "annotate":
      return "Annotate this region…";
    case "ask":
      return "Ask about this region…";
    case "contest":
      return "Why do you disagree with this ground?";
    case "menu":
      return "";
  }
}

function labelFor(mode: Mode): string {
  switch (mode) {
    case "annotate":
      return "Annotate";
    case "ask":
      return "Ask";
    case "contest":
      return "Submit contest";
    case "menu":
      return "";
  }
}

export function SelectionContextMenu({
  api,
  citation,
  anchorRect,
  onClose,
}: {
  api: ApiConfig;
  citation: CodeCitationInput;
  /** The selection's screen rect to float next to (lib/editor-selection.ts's `selectionInfo().anchorRect`) -- a snapshot taken once at selection time, not a live-tracking value (same contract as KbRefHoverCard's `anchorRect`). Null falls back to `FALLBACK_ANCHOR`. */
  anchorRect: PlacementRect | null;
  onClose: () => void;
}): React.JSX.Element {
  const [mode, setMode] = useState<Mode>("menu");
  const [text, setText] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const menuRef = useRef<HTMLDivElement | null>(null);
  const anchor = anchorRect ?? FALLBACK_ANCHOR;
  // Provisional position (hidden) until the layout effect below measures
  // this popover's OWN rendered size and re-places it -- avoids a one-
  // frame flash at the wrong spot (e.g. wherever the DOM insertion point
  // would otherwise put a `position: fixed` element with no top/left).
  const [style, setStyle] = useState<React.CSSProperties>({
    position: "fixed",
    top: anchor.bottom + 8,
    left: anchor.left,
    visibility: "hidden",
  });

  // Re-measure and re-place whenever the anchor moves (a new selection)
  // or the popover's own size can change (menu <-> text-box form) --
  // useLayoutEffect runs synchronously before paint, so the "hidden"
  // provisional style above is never actually visible on screen.
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const placed = placePopover(
      anchor,
      { width: window.innerWidth, height: window.innerHeight },
      { width, height },
    );
    setStyle({ position: "fixed", top: placed.top, left: placed.left });
    // `anchor` is a fresh object each render (derived from `anchorRect ??
    // FALLBACK_ANCHOR`), so its four numeric fields -- not the object
    // itself -- are the real dependency (no lint rule enforces hook
    // dependency completeness in this repo's eslint.config.js;
    // CodeActivity.tsx's own header makes the identical choice for the
    // identical reason: a plain, load-bearing comment, not a suppression).
  }, [anchor.top, anchor.bottom, anchor.left, anchor.right, mode]);

  /** Esc closes the popover -- keyboard parity with the visible × control; a plain bubbled keydown on the container, so it fires regardless of which control inside currently has focus. */
  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Escape") onClose();
  }

  async function markUnderstood(): Promise<void> {
    setStatus("saving");
    try {
      await postHumanEvent(api, "mark_understood", { targetPath: citation.path });
      onClose();
    } catch {
      setStatus("error");
    }
  }

  async function submit(): Promise<void> {
    if (text.trim() === "") return;
    setStatus("saving");
    try {
      if (mode === "annotate") await postAnnotation(api, { citation, text, kind: "note" });
      else if (mode === "ask") await postHumanEvent(api, "question", { text, citation });
      else if (mode === "contest")
        await postHumanEvent(api, "contest", { targetPath: citation.path, reason: text });
      onClose();
    } catch {
      setStatus("error");
    }
  }

  return (
    <div
      ref={menuRef}
      className="selection-menu"
      role="menu"
      aria-label={`Actions for ${citationLocationLabel(citation)}`}
      style={style}
      onKeyDown={handleKeyDown}
      data-testid="selection-menu"
    >
      <span className="selection-menu-scope">{citationLocationLabel(citation)}</span>
      {mode === "menu" ? (
        <div className="selection-menu-actions">
          <button type="button" onClick={() => setMode("annotate")}>
            Annotate
          </button>
          <button type="button" onClick={() => setMode("ask")}>
            Ask about this
          </button>
          <button
            type="button"
            onClick={() => void markUnderstood()}
            disabled={status === "saving"}
          >
            Mark understood
          </button>
          <button type="button" onClick={() => setMode("contest")}>
            Contest
          </button>
          <button
            type="button"
            className="selection-menu-close"
            onClick={onClose}
            aria-label="Dismiss selection menu"
          >
            ×
          </button>
        </div>
      ) : (
        <form
          className="selection-menu-form"
          onSubmit={(formEvent) => {
            formEvent.preventDefault();
            void submit();
          }}
        >
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={submitOnCtrlEnter()}
            placeholder={placeholderFor(mode)}
            rows={2}
          />
          <div className="selection-menu-form-actions">
            <button type="submit" disabled={status === "saving" || text.trim() === ""}>
              {status === "saving" ? "Saving…" : labelFor(mode)}
            </button>
            <button type="button" onClick={() => setMode("menu")}>
              Back
            </button>
          </div>
          {status === "error" && <span className="selection-menu-error">could not save</span>}
        </form>
      )}
    </div>
  );
}
