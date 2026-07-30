// Component: CodeActivity -- the Code tab: file tree + search + the
// existing CodeMirror/KB viewers, GitHub-style, with `kb/`-referencing
// comments linkified into hover cards (kb/plan.md step 3).
//
// Supersedes BrowsePane.tsx's job (sanctioned deletion, kb/plan.md's agent
// notes: "v1's orphaned review components... may be deleted in step 3, not
// before -- the Map/Code activities replace their jobs") and fully carries
// forward US2's free-nav promise (v2 PRD: "free navigation (US2) lives in
// the Code activity") -- file tree, search, and the KB-vs-code viewer
// routing (lib/use-open-path.ts) are UNCHANGED capabilities, just composed
// here instead of in BrowsePane. The always-visible annotate/impression/
// question/mark-understood side FORMS BrowsePane carried are deliberately
// NOT reintroduced -- SelectionContextMenu covers "select a region ->
// annotate / ask / mark understood / contest" as a discoverable popover
// instead of a permanent panel, matching the round-6 mockup's GitHub-like
// density (docs/design/rethink-mockup-2026-07-18.html).
//
// 2026-07-19 dogfood fix: SelectionContextMenu now FLOATS next to the
// selection (`selection.anchorRect`, from CodeViewer's `onSelectionChange`
// -- lib/editor-selection.ts's `selectionInfo`) instead of docking at the
// bottom of `.code-activity-scroll`, so a selection made near the top of a
// long file no longer requires scrolling all the way down to write the
// note. It's rendered as a SIBLING of `.code-activity-main` (like
// `KbRefHoverCard` below), not nested inside the scroll container -- a
// `position: fixed` popover doesn't need to be inside the scrollable area,
// and staying out of it sidesteps any ancestor `overflow` clipping. The
// anchor rect is a SNAPSHOT (KbRefHoverCard's own contract), so a scroll or
// resize after selecting would otherwise leave it pointing at a stale
// spot -- rather than repositioning every scroll frame, `useEffect` below
// just closes the popover on scroll/resize while a selection is open
// (SelectionContextMenu.tsx's header has the full rationale).
//
// R7-3 (kb/plan.md, "clickable citations everywhere"): `openRequest`
// (lib/code-nav.ts) is an OPTIONAL controlled prop -- App.tsx sets it (and
// switches `tab` to "code") whenever a citation link or a glossary card's
// "jump to definition" is clicked elsewhere in the app. This component stays
// the SOLE owner of `selectedPath`/`jumpTarget` (a citation click does not
// need App.tsx to know which file is currently open, only to REQUEST one),
// so free navigation via the file tree/search keeps working exactly as
// before when `openRequest` is never supplied (every existing caller/test).
import { useEffect, useRef, useState } from "react";
import { useOpenPath } from "../lib/use-open-path";
import { describeError } from "../lib/error-ui";
import { FileTree } from "./FileTree";
import { SearchBox } from "./SearchBox";
import { CodeViewer } from "./CodeViewer";
import { KbViewer } from "./KbViewer";
import { KbRefHoverCard } from "./KbRefHoverCard";
import { SelectionContextMenu } from "./SelectionContextMenu";
import type { ApiConfig } from "../lib/api";
import type { SearchMatch } from "../lib/browse-api";
import type { CodeNavRequest } from "../lib/code-nav";
import type { KbRefSpan } from "@backbrief/shared/browser";
import type { SelectionInfo } from "../lib/editor-selection";

interface Hovered {
  span: KbRefSpan;
  rect: DOMRect;
}

interface JumpTarget {
  line: number | undefined;
  anchor: string | undefined;
}

const NO_JUMP: JumpTarget = { line: undefined, anchor: undefined };

export function CodeActivity({
  api,
  noKbMode = false,
  openRequest = null,
}: {
  api: ApiConfig;
  /** C1: no KB configured for this repo -- `.md` files render as plain code, matching lib/use-open-path.ts's own routing skip. */
  noKbMode?: boolean;
  /** R7-3: an external "open this file, at this line/anchor" request (a citation link, a glossary card's link) -- `nonce` (code-nav.ts) makes every click its own request, so re-clicking the SAME target still re-scrolls. */
  openRequest?: CodeNavRequest | null;
}): React.JSX.Element {
  const [selectedPath, setSelectedPath] = useState<string | null>(openRequest?.path ?? null);
  const { file, kb, error } = useOpenPath(api, selectedPath, noKbMode);
  const [selection, setSelection] = useState<SelectionInfo | null>(null);
  const [hovered, setHovered] = useState<Hovered | null>(null);
  const [jumpTarget, setJumpTarget] = useState<JumpTarget>(
    openRequest ? { line: openRequest.line, anchor: openRequest.anchor } : NO_JUMP,
  );
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setSelection(null), [selectedPath]);

  // The popover's anchor rect is a one-time snapshot (module header) --
  // scrolling the code area or resizing the window after selecting would
  // leave it pointing at a stale spot, so close rather than show something
  // in the wrong place (P1). The selection itself stays visible in CM6, so
  // re-opening the menu is one more select-drag away.
  useEffect(() => {
    if (!selection) return;
    const container = scrollRef.current;
    if (!container) return;
    const close = (): void => setSelection(null);
    container.addEventListener("scroll", close, { passive: true });
    window.addEventListener("resize", close);
    return () => {
      container.removeEventListener("scroll", close);
      window.removeEventListener("resize", close);
    };
  }, [selection]);

  // A fresh `openRequest` (new `nonce`) always wins over whatever the tree/
  // search left open -- this is the ONE effect that lets an external click
  // override free navigation; every other state change here stays local.
  // `openRequest?.nonce` alone is the intended dependency (module header:
  // identity/nonce-driven, not value equality) -- no lint rule enforces
  // hook dependency completeness in this repo's eslint.config.js
  // (MapView.tsx's own precedent makes the identical choice), so this is a
  // plain, load-bearing comment, not a suppression.
  useEffect(() => {
    if (!openRequest) return;
    setSelectedPath(openRequest.path);
    setJumpTarget({ line: openRequest.line, anchor: openRequest.anchor });
  }, [openRequest?.nonce]);

  /** A manual file-tree/search pick clears any pending jump -- browsing to a DIFFERENT file has no line/anchor to land on. */
  function selectPath(path: string): void {
    setSelectedPath(path);
    setJumpTarget(NO_JUMP);
  }

  function handleKbRefHover(span: KbRefSpan | null, target: HTMLElement | null): void {
    setHovered(span && target ? { span, rect: target.getBoundingClientRect() } : null);
  }

  return (
    <div className="code-activity">
      <aside className="code-activity-tree">
        <SearchBox api={api} onOpenMatch={(m: SearchMatch) => selectPath(m.path)} />
        <FileTree api={api} selectedPath={selectedPath} onSelect={selectPath} />
      </aside>
      <div className="code-activity-main">
        <div className="code-activity-pathbar">
          {selectedPath ?? "select a file to browse"}
          {file && <span className="code-activity-hint">select lines to annotate</span>}
        </div>
        <div className="code-activity-scroll" ref={scrollRef}>
          {!selectedPath && <p className="code-activity-empty">Select a file to browse.</p>}
          {error !== null && <p className="code-activity-error">{describeError(error).text}</p>}
          {kb && (
            <KbViewer kb={kb} {...(jumpTarget.anchor ? { jumpToAnchor: jumpTarget.anchor } : {})} />
          )}
          {file && (
            <CodeViewer
              content={file.content}
              language={file.language}
              kbRefs={file.kbReferences}
              onKbRefHover={handleKbRefHover}
              onSelectionChange={setSelection}
              {...(jumpTarget.line !== undefined ? { jumpToLine: jumpTarget.line } : {})}
            />
          )}
        </div>
      </div>
      {/* Rendered OUTSIDE `.code-activity-scroll` -- a `position: fixed`
       * popover (SelectionContextMenu.tsx) doesn't belong to the
       * scrollable area's layout, and staying out of it sidesteps any
       * ancestor `overflow` clipping (module header). */}
      {selection && selectedPath && file && (
        <SelectionContextMenu
          api={api}
          citation={{
            kind: "code",
            path: selectedPath,
            startLine: selection.lines[0],
            endLine: selection.lines[1],
          }}
          anchorRect={selection.anchorRect}
          onClose={() => setSelection(null)}
        />
      )}
      {hovered && <KbRefHoverCard api={api} span={hovered.span} anchorRect={hovered.rect} />}
    </div>
  );
}
