// Component: MapNodeCard -- the Map activity's selected-node card: question,
// answer, state + evidence history, citations, confirm/refine/contest
// (kb/spec/comprehension-map.md's `node_response`).
//
// kb/plan.md step 3: "selected node opens a card... confirm/refine/contest
// buttons wired to node_response." Supersedes step 1's MapList.tsx row
// controls (same postNodeResponse call, card layout instead of a list row --
// plan.md's own words: "the full map view is step 3's job"). Docs/design/
// rethink-mockup-2026-07-18.html's `.nodecard` is the visual reference.
//
// PLACEMENT (2026-07-22 dogfood fix): this used to render as a plain
// in-flow element below the graph -- correct on a small map, but on a
// large one the card landed off the bottom of the viewport, so opening a
// node near the top meant scrolling all the way down past the whole
// canvas just to read it. It now floats as a `position: fixed` popover
// anchored to the CLICKED NODE'S OWN screen rect (`anchorRect`, a
// one-time snapshot MapView.tsx takes via `getBoundingClientRect()` at
// click time), placed with the SAME viewport-aware below/above/clamp math
// as the Code activity's SelectionContextMenu -- lib/popover-position.ts's
// `placePopover`, pure and unit-tested without real DOM layout
// (SelectionContextMenu.tsx's header has the full precedent and
// rationale). A `useLayoutEffect` measures this card's OWN rendered size
// (its content is data-dependent -- evidence history, citation count --
// so it can't be assumed fixed) and re-places it before paint, avoiding a
// flash at the wrong spot. Staleness after a scroll/resize is the
// CALLER's job (MapView.tsx closes rather than re-tracks, same tradeoff
// SelectionContextMenu makes), not this component's.
//
// Citation validity: GET /api/map is served from the maintained snapshot,
// NOT re-validated per read (comprehension-map.md#read-api, NF1) -- so this
// card does not claim a per-citation live tick. Instead it reflects the
// NODE's own overlay state: `invalidated` (the only state staleness can
// produce, comprehension-map.md's authority table) flags every citation
// with one honest "needs a fresh look" tag; anything else shows a plain
// "cited" tag. This is coarser than a true per-citation check but never
// claims more freshness than the snapshot actually has.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { postNodeResponse } from "../lib/map-api";
import { citationLocationLabel } from "../lib/citation-view";
import { citationNavTarget, type CodeNavTarget } from "../lib/code-nav";
import { placePopover, type PlacementRect } from "../lib/popover-position";
import type { ApiConfig } from "../lib/api";
import type { MapNode, MasteryState, OverlayEvidence } from "@backbrief/shared/browser";

/** Anchor used when the caller has no resolvable rect (shouldn't happen in
 *  practice -- MapView.tsx always captures one at click time -- but keeps
 *  this component total rather than crashing on a null prop, same
 *  contract as SelectionContextMenu's `FALLBACK_ANCHOR`). */
const FALLBACK_ANCHOR: PlacementRect = { top: 0, bottom: 0, left: 0, right: 0 };

/** Mirrors MapList.tsx's retired STATE_LABEL -- one label per MasteryState so a new state can never render unstyled. */
const STATE_LABEL: Record<MasteryState, string> = {
  unseen: "unseen",
  introduced: "introduced",
  grasped: "grasped",
  demonstrated: "demonstrated",
  shaky: "shaky",
  contested: "contested",
  invalidated: "invalidated (repo moved)",
};

function evidenceLine(entry: OverlayEvidence): string {
  const date = entry.ts.slice(0, 10);
  const detail = entry.verbatim ? `: ${entry.verbatim}` : "";
  return `${date} · ${entry.kind}${detail}`;
}

export function MapNodeCard({
  api,
  node,
  state,
  evidence,
  refinedAnswer,
  anchorRect,
  onClose,
  onOpenCitation,
}: {
  api: ApiConfig;
  node: MapNode;
  state: MasteryState;
  evidence: readonly OverlayEvidence[];
  /** OverlayEntry.refinedAnswer -- lives on the OVERLAY (per-user layer), not on the shared MapNode, so a caller reading both from foldMap/foldOverlay passes it through explicitly rather than this component reaching into a second data source. */
  refinedAnswer?: string;
  /** The clicked node's own screen rect (MapView.tsx's `getBoundingClientRect()` snapshot at click time) to float this popover next to -- null falls back to `FALLBACK_ANCHOR`. */
  anchorRect: PlacementRect | null;
  onClose: () => void;
  /** R7-3: opens a cited file in the Code tab at the line (lib/code-nav.ts) -- optional so existing callers/tests that don't exercise navigation are unaffected. */
  onOpenCitation?: (target: CodeNavTarget) => void;
}): React.JSX.Element {
  const [mode, setMode] = useState<"idle" | "refine" | "contest">("idle");
  const [text, setText] = useState("");
  const cardRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const anchor = anchorRect ?? FALLBACK_ANCHOR;
  // Provisional position (hidden) until the layout effect below measures
  // this card's own rendered size and re-places it -- same one-frame-flash
  // avoidance as SelectionContextMenu.tsx.
  const [style, setStyle] = useState<React.CSSProperties>({
    position: "fixed",
    top: anchor.bottom + 8,
    left: anchor.left,
    visibility: "hidden",
  });

  // Re-measure and re-place whenever the anchor moves (a different node
  // clicked) or the card's own size can change (evidence history/mode
  // toggling the refine/contest form) -- useLayoutEffect runs synchronously
  // before paint, so the "hidden" provisional style above never actually
  // shows.
  useLayoutEffect(() => {
    const el = cardRef.current;
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
    // itself -- are the real dependency (SelectionContextMenu.tsx's own
    // header makes the identical choice for the identical reason: no lint
    // rule enforces hook dependency completeness in this repo's
    // eslint.config.js, so this is a plain, load-bearing comment, not a
    // suppression).
  }, [anchor.top, anchor.bottom, anchor.left, anchor.right, mode, evidence.length]);

  // Accessibility: focus moves into the card on open (its close control,
  // the first interactive element) rather than staying on the node button
  // that triggered it -- re-runs on `node.id` so re-selecting a different
  // node while the card is already open (no unmount) still re-focuses.
  useEffect(() => {
    closeRef.current?.focus();
  }, [node.id]);

  /** Esc closes the card -- keyboard parity with the visible × control; a plain bubbled keydown so it fires regardless of which control inside currently has focus (mirrors SelectionContextMenu.tsx). */
  function handleKeyDown(event: React.KeyboardEvent<HTMLElement>): void {
    if (event.key === "Escape") onClose();
  }

  const confirm = (): void => void postNodeResponse(api, { nodeId: node.id, response: "confirm" });
  const submit = (): void => {
    if (!text.trim()) return;
    const call =
      mode === "refine"
        ? postNodeResponse(api, { nodeId: node.id, response: "refine", refinedAnswer: text })
        : postNodeResponse(api, { nodeId: node.id, response: "contest", reason: text });
    void call.then(() => {
      setMode("idle");
      setText("");
    });
  };

  return (
    <aside
      ref={cardRef}
      className="map-node-card"
      data-testid="map-node-card"
      style={style}
      onKeyDown={handleKeyDown}
    >
      <div className="map-node-card-head">
        <span className={`map-node-state map-node-state-${state}`}>{STATE_LABEL[state]}</span>
        <span className="map-node-card-type">
          {node.type} · {node.level}
        </span>
        <button
          ref={closeRef}
          type="button"
          className="map-node-card-close"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
      </div>
      <h3>{node.question}</h3>
      <p>{refinedAnswer ?? node.answer}</p>
      {evidence.length > 0 && (
        <ul className="map-node-card-history">
          {evidence.map((e, i) => (
            <li key={i}>{evidenceLine(e)}</li>
          ))}
        </ul>
      )}
      <div className="map-node-card-cites">
        {node.citations.map((c, i) => {
          const staleClass = state === "invalidated" ? " map-node-card-cite-stale" : "";
          const label = (
            <>
              {citationLocationLabel(c)} ·{" "}
              {state === "invalidated" ? "needs a fresh look" : "cited"}
            </>
          );
          return onOpenCitation ? (
            <button
              type="button"
              key={i}
              className={`map-node-card-cite citation-link${staleClass}`}
              onClick={() => onOpenCitation(citationNavTarget(c))}
            >
              {label}
            </button>
          ) : (
            <span key={i} className={`map-node-card-cite${staleClass}`}>
              {label}
            </span>
          );
        })}
      </div>
      <div className="map-node-card-actions">
        <button type="button" onClick={confirm}>
          Confirm
        </button>
        <button type="button" onClick={() => setMode(mode === "refine" ? "idle" : "refine")}>
          Refine
        </button>
        <button type="button" onClick={() => setMode(mode === "contest" ? "idle" : "contest")}>
          Contest
        </button>
      </div>
      {mode !== "idle" && (
        <div className="map-node-card-form">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={mode === "refine" ? "Your corrected answer…" : "Why is this wrong?"}
            rows={2}
          />
          <button type="button" onClick={submit}>
            Submit
          </button>
        </div>
      )}
    </aside>
  );
}
