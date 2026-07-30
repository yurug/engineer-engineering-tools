// Module: lib/callout-widgets -- CM6 block widgets that mount an agent
// callout or human annotation INLINE, right after the code lines it's
// about, inside the editor's own document flow.
//
// FIX 3 (dogfood 2026-07-13: "j'ai même pas vu l'existence de cette
// nouvelle carte parce que je scrollais à l'intérieur du code" -- "I hadn't
// even seen the new card because I was scrolling INSIDE the code"): the OLD
// design rendered every callout/annotation as a CanvasBlock stacked BELOW a
// CodeViewer that scrolled INDEPENDENTLY (its own `.code-viewer{overflow:
// auto}`, see styles.css) -- so a card below the editor was invisible while
// the user scrolled the code itself. styles.css's own FIX-3 comment block
// removes that inner scrollbar (CodeViewer.tsx now sizes to its content,
// CM6's documented "auto-height, page/ancestor scrolls" mode); THIS module
// is the other half -- moving the explanation itself to live inside that
// one remaining scroll region, anchored at the exact lines it explains,
// rather than trusting the user to keep scrolling past the editor to find it.
//
// kb/external/codemirror6.md: "Decorations... must be provided through a
// StateField." This mirrors lib/citation-decorations.ts's
// StateField-wrapping-a-pure-builder shape exactly, but for
// `Decoration.widget({block:true})` instead of `Decoration.line()`.
//
// Sanitized HTML string, NOT a mounted React root: CM6 can tear a widget's
// DOM down SYNCHRONOUSLY during its own view-update pass (e.g. a
// dispatch() triggered from a plain, non-React DOM event) -- unmounting a
// React root from inside that call risks "update while rendering" races
// for no real benefit here, since a mounted-in-place explanation only
// needs ONE interactive affordance (resolving an annotation), which is a
// single plain `addEventListener`, not a reason to host a whole React
// subtree. Everything else an agent callout offers elsewhere (Ask a
// follow-up, diagram Expand/Regenerate, the "⋯" menus) stays in
// CanvasBlocks.tsx's trailing-block flow -- reachable via the pinned RIGHT
// composer for follow-ups, and diagrams are explicitly NOT inlined here
// (Canvas.tsx's header: they aren't the nested-scroll offender).
// `renderCardMarkdown` is the SAME html:false-sanitized renderer
// CanvasBlocks.tsx's CalloutBlock already trusts (lib/markdown.ts) --
// no new sanitization boundary is introduced.
import { RangeSetBuilder } from "@codemirror/state";
import type { EditorState } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";
import { StateField } from "@codemirror/state";
import { renderCardMarkdown } from "./markdown";

export interface CalloutWidgetSpec {
  /** Stable per-envelope identity -- CM6 diffs widgets via `eq`; a changed
   *  key (not just changed text) is what forces CM6 to actually remount. */
  key: string;
  /** 1-based line the widget mounts AFTER -- the cited region's last line. */
  afterLine: number;
  /** "agent · on server.ts:1-16" / "you" -- CanvasBlocks.tsx's own `.who` wording, kept identical so the inline and (diagram-only, now) trailing renderings read the same. */
  whoLabel: string;
  /** "region · lines 4–9" -- annotation-only; undefined for an agent callout (CanvasBlocks.tsx's `.annot .scope` badge has no analog on `.callout`). */
  scopeLabel?: string;
  body: string;
  /** "markdown" runs `body` through renderCardMarkdown (agent callouts); "text" renders it as plain, escaped text (human annotations -- CanvasBlocks.tsx's AnnotationBlock never markdown-renders a note). */
  bodyFormat: "markdown" | "text";
  className: "callout" | "annot";
  /** Present only for a resolvable human annotation. */
  onResolve?: () => void;
  /** The clickable "re-focus this citation" badge -- docs/design/
   *  redesign-mockup.html's own `.callout .cite` badge is clickable too
   *  (its `data-target` re-scrolls). Present only for a CALLOUT (mirrors
   *  CanvasBlocks.tsx's CalloutBlock: an annotation's `.scope` label is
   *  already its own citation, restating it as a second clickable badge
   *  would be redundant there). */
  citation?: {
    label: string;
    /** citationView(state).className -- e.g. "citation-valid" (lib/citation-view.ts). */
    className: string;
    stateLabel: string;
    /** True for a broken citation -- never clickable as if grounded (P1), matching CanvasBlocks.tsx's CiteChip. */
    disabled: boolean;
    onJump: () => void;
  };
}

/**
 * @invariant `eq` compares every field CM6 needs to know changed -- NOT
 *   just `key` -- because a Resolve click doesn't change an envelope's id
 *   (still the same annotation, now archived) but archiving is server-side
 *   and this module never re-renders on its own, so in practice `key`
 *   alone already changes whenever Canvas.tsx rebuilds the spec list
 *   (a fresh envelope stream). The fuller comparison just avoids a stale
 *   widget surviving a future incremental-update path.
 */
class CalloutWidget extends WidgetType {
  constructor(private readonly spec: CalloutWidgetSpec) {
    super();
  }

  override eq(other: CalloutWidget): boolean {
    return other.spec.key === this.spec.key && other.spec.body === this.spec.body;
  }

  override toDOM(): HTMLElement {
    const container = document.createElement("div");
    container.className = `cm-callout-widget ${this.spec.className}`;
    if (this.spec.scopeLabel !== undefined) {
      const scope = document.createElement("span");
      scope.className = "scope";
      scope.textContent = this.spec.scopeLabel;
      container.appendChild(scope);
    }
    const who = document.createElement("div");
    who.className = "who";
    who.textContent = this.spec.whoLabel;
    container.appendChild(who);
    container.appendChild(this.buildBody());
    if (this.spec.citation) container.appendChild(this.buildCitationButton(this.spec.citation));
    if (this.spec.onResolve) container.appendChild(this.buildResolveButton(this.spec.onResolve));
    return container;
  }

  private buildCitationButton(citation: NonNullable<CalloutWidgetSpec["citation"]>): HTMLElement {
    const row = document.createElement("div");
    row.className = "cite-row";
    const button = document.createElement("button");
    button.type = "button";
    button.className = `cite ${citation.className}`;
    button.disabled = citation.disabled;
    button.textContent = `${citation.label} · ${citation.stateLabel}`;
    button.addEventListener("click", citation.onJump);
    row.appendChild(button);
    return row;
  }

  /** Markdown callouts render sanitized HTML (renderCardMarkdown, html:false); annotations render as plain escaped text inside a <p> -- matches CanvasBlocks.tsx's AnnotationBlock exactly (never markdown-rendered there either). */
  private buildBody(): HTMLElement {
    if (this.spec.bodyFormat === "markdown") {
      const body = document.createElement("div");
      body.innerHTML = renderCardMarkdown(this.spec.body); // sanitized -- html:false (lib/markdown.ts)
      return body;
    }
    const paragraph = document.createElement("p");
    paragraph.textContent = this.spec.body; // textContent, never innerHTML -- no markdown/HTML parsing for a plain human note
    return paragraph;
  }

  private buildResolveButton(onResolve: () => void): HTMLElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "block-menu-action";
    button.textContent = "Resolve";
    button.addEventListener("click", onResolve);
    return button;
  }

  /** Lets clicks (the Resolve button) reach our own listener instead of CM6 swallowing them as editor input. */
  override ignoreEvent(): boolean {
    return false;
  }
}

/**
 * @param state the document the specs apply to -- an `afterLine` outside
 *   `1..state.doc.lines` is clamped rather than crashing (P1: a stale/
 *   relocated citation must never break the viewer).
 * @returns a DecorationSet with one block widget per spec, ordered by
 *   document position (CM6 requires ascending positions when building).
 */
export function buildCalloutWidgetDecorations(
  state: EditorState,
  specs: readonly CalloutWidgetSpec[],
): DecorationSet {
  const marks: { pos: number; deco: Decoration }[] = specs.map((spec) => {
    const line = Math.max(1, Math.min(state.doc.lines, spec.afterLine));
    return {
      pos: state.doc.line(line).to,
      deco: Decoration.widget({ widget: new CalloutWidget(spec), block: true, side: 1 }),
    };
  });
  marks.sort((a, b) => a.pos - b.pos);
  const builder = new RangeSetBuilder<Decoration>();
  for (const mark of marks) builder.add(mark.pos, mark.pos, mark.deco);
  return builder.finish();
}

/**
 * A StateField wrapping `buildCalloutWidgetDecorations`, computed once at
 * document creation -- CodeViewer.tsx rebuilds the WHOLE EditorState (not
 * just this field) whenever `calloutWidgets` changes, same rationale as
 * citation-decorations.ts's `citationHighlightField`.
 */
export function calloutWidgetField(initialSpecs: readonly CalloutWidgetSpec[]) {
  return StateField.define<DecorationSet>({
    create: (state) => buildCalloutWidgetDecorations(state, initialSpecs),
    update: (decorations) => decorations,
    provide: (field) => EditorView.decorations.from(field),
  });
}
