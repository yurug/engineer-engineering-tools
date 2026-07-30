// Component: MapView -- the Map activity: a full-width dagre-laid graph of
// the comprehension map (kb/plan.md step 3), question labels, mastery-state
// colors, level-of-detail collapse of mastered regions, and a selected-
// node card (MapNodeCard.tsx) wired to `node_response`.
//
// Visual reference: docs/design/rethink-mockup-2026-07-18.html's `.mapview`
// (graph + node card + legend). Layout math: lib/map-layout.ts
// (@dagrejs/dagre, per kb/external/dagre-layout.md); LOD collapse rule:
// lib/map-visibility.ts.
//
// PLACEMENT (2026-07-22 dogfood fix): the node card used to render as a
// normal in-flow sibling below `.map-scroll` -- on a large graph that meant
// "click a node near the top, then scroll all the way down past the whole
// canvas to read its card." It now FLOATS as a `position: fixed` popover
// anchored to the CLICKED NODE'S OWN screen rect, mirroring the identical
// fix already shipped for the Code activity's SelectionContextMenu
// (SelectionContextMenu.tsx's header has the full rationale;
// lib/popover-position.ts's `placePopover` is the shared, unit-tested
// placement math -- below the node by default, flip above near the
// viewport bottom, clamp to stay on-screen). `handleClick` captures
// `event.currentTarget.getBoundingClientRect()` at click time (the node
// button IS the anchor -- no separate ref registry needed) and stores it
// alongside `selectedNodeId`; MapNodeCard.tsx does the actual measure-then-
// place (it owns its own rendered size, this component doesn't). The
// anchor rect is a SNAPSHOT, so a scroll of `.map-scroll` or a window
// resize after selecting would leave it pointing at a stale spot --
// exactly SelectionContextMenu's problem -- so the effect below closes the
// card on either, rather than repositioning every scroll frame.
// @invariant kb/external/dagre-layout.md's "relayout only on structural
// change": `layoutMap` (an expensive dagre.layout call) runs inside a
// `useMemo` keyed on `structuralKey`'s output, NOT on `overlay` or `nodes`
// directly -- most overlay transitions (a color flip) leave the structural
// key unchanged, so React's memo never re-invokes the factory and
// `dagre.layout` is never called again for them. Verified by a
// `dagre.layout` call-count spy in test/components/MapView.test.tsx.
import { useEffect, useMemo, useRef, useState } from "react";
import { layoutMap, type LayoutNode } from "../lib/map-layout";
import { structuralKey } from "../lib/map-visibility";
import { MapNodeCard } from "./MapNodeCard";
import type { ApiConfig } from "../lib/api";
import type { CodeNavTarget } from "../lib/code-nav";
import type { PlacementRect } from "../lib/popover-position";
import type { MapNode, MasteryState, OverlayEntry } from "@backbrief/shared/browser";

/** The mockup's six visual states (task scope: "demonstrated/grasped/
 *  in-play/frontier/shaky/invalidated") plus `contested` (a real
 *  MasteryState the mockup's legend omits but this view must still style
 *  distinctly -- MapList.tsx's own precedent: "a new state can never
 *  render unstyled") and the neutral default for everything else. */
type VisualState =
  | "demonstrated"
  | "grasped"
  | "contested"
  | "invalidated"
  | "shaky"
  | "in-play"
  | "frontier"
  | "unseen";

/** Priority order matches the mockup's own reading: a more specific/severe
 *  signal (a human verdict, staleness) always outranks the purely
 *  positional "in-play"/"frontier" labels. */
function visualStateOf(
  state: MasteryState,
  nodeId: string,
  currentMoveNodeId: string | undefined,
  onFrontier: boolean,
): VisualState {
  if (
    state === "demonstrated" ||
    state === "grasped" ||
    state === "contested" ||
    state === "invalidated" ||
    state === "shaky"
  ) {
    return state;
  }
  if (nodeId === currentMoveNodeId) return "in-play";
  if (onFrontier) return "frontier";
  return "unseen";
}

export function MapView({
  api,
  nodes,
  overlay,
  frontier,
  currentMoveNodeId,
  onOpenCitation,
}: {
  api: ApiConfig;
  nodes: MapNode[];
  overlay: OverlayEntry[];
  frontier: string[];
  /** The node the CURRENTLY open present_move targets (if any) -- Session's centerpiece; the Map shows it as "in play." */
  currentMoveNodeId?: string;
  /** R7-3: opens a node's cited file in the Code tab (lib/code-nav.ts) -- threaded straight through to MapNodeCard. */
  onOpenCitation?: (target: CodeNavTarget) => void;
}): React.JSX.Element {
  const [expandedRegions, setExpandedRegions] = useState<ReadonlySet<string>>(new Set());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  /** The clicked node's own screen rect at click time (module header) --
   *  a one-time snapshot passed to MapNodeCard as its popover anchor, not
   *  a live-tracking value. */
  const [selectedAnchorRect, setSelectedAnchorRect] = useState<PlacementRect | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const stateById = useMemo(() => new Map(overlay.map((e) => [e.nodeId, e.state])), [overlay]);
  const stateOf = (id: string): MasteryState => stateById.get(id) ?? "unseen";
  const frontierSet = useMemo(() => new Set(frontier), [frontier]);

  // `key` alone is the dependency -- deliberately NOT `nodes`/`overlay`/
  // `expandedRegions` directly (module header): those change on every
  // overlay-only update too, which would defeat the whole point of this
  // guard. No lint rule enforces react hook dependency completeness in
  // this repo's eslint.config.js, so this is a plain, load-bearing comment,
  // not a suppression.
  const key = structuralKey(nodes, stateOf, expandedRegions);
  const layout = useMemo(() => layoutMap(nodes, stateOf, expandedRegions), [key]);

  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const overlayEntryOf = (id: string): OverlayEntry | undefined =>
    overlay.find((e) => e.nodeId === id);

  function handleClick(layoutNode: LayoutNode, event: React.MouseEvent<HTMLButtonElement>): void {
    // Stop the click from reaching the canvas's background handler (which
    // dismisses an open card): clicking a node SELECTS it (or expands a
    // region), it must never also count as a background click.
    event.stopPropagation();
    if (layoutNode.isRegion) {
      setExpandedRegions((prev) => new Set(prev).add(layoutNode.id));
      return;
    }
    // The node button IS the anchor -- its own on-screen rect at click
    // time, no separate ref registry needed (module header).
    setSelectedAnchorRect(event.currentTarget.getBoundingClientRect());
    setSelectedNodeId(layoutNode.id);
  }

  function closeCard(): void {
    setSelectedNodeId(null);
    setSelectedAnchorRect(null);
  }

  // The anchor rect is a snapshot (module header) -- a scroll of the map
  // canvas or a window resize after selecting would leave it pointing at a
  // stale spot, so close rather than show the card in the wrong place (P1).
  // Mirrors CodeActivity.tsx's identical guard for SelectionContextMenu.
  useEffect(() => {
    if (!selectedNodeId) return;
    const container = scrollRef.current;
    const close = (): void => closeCard();
    container?.addEventListener("scroll", close, { passive: true });
    window.addEventListener("resize", close);
    return () => {
      container?.removeEventListener("scroll", close);
      window.removeEventListener("resize", close);
    };
  }, [selectedNodeId]);

  const selectedNode = selectedNodeId ? (nodeById.get(selectedNodeId) ?? null) : null;

  return (
    <div className="map-view">
      {/* A click that reaches here fell through the canvas background (nodes
       * stop propagation in `handleClick`) -- treat it as "dismiss the open
       * card", the mouse parity to MapNodeCard's Esc handler. The card itself
       * is a sibling of `.map-scroll`, so its own clicks never bubble in. */}
      <div className="map-scroll" ref={scrollRef} onClick={closeCard}>
        <div
          className="map-canvas"
          style={{ width: Math.max(layout.width, 1), height: Math.max(layout.height, 1) }}
        >
          <svg className="map-edges" aria-hidden="true">
            {layout.edges.map((e) => (
              <line key={e.id} className="map-edge" x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} />
            ))}
          </svg>
          {layout.nodes.map((ln) => (
            <MapGraphNode
              key={ln.id}
              layoutNode={ln}
              node={nodeById.get(ln.id)}
              visualState={visualStateOf(
                stateOf(ln.id),
                ln.id,
                currentMoveNodeId,
                frontierSet.has(ln.id),
              )}
              selected={ln.id === selectedNodeId}
              onClick={(e) => handleClick(ln, e)}
            />
          ))}
        </div>
      </div>
      {/* `position: fixed` (MapNodeCard.tsx) -- doesn't belong to
       * `.map-scroll`'s in-flow layout; staying a sibling here is enough,
       * no ancestor `overflow` clips a fixed-positioned element anyway. */}
      {selectedNode && (
        <MapNodeCard
          api={api}
          node={selectedNode}
          state={stateOf(selectedNode.id)}
          evidence={overlayEntryOf(selectedNode.id)?.evidence ?? []}
          anchorRect={selectedAnchorRect}
          {...(overlayEntryOf(selectedNode.id)?.refinedAnswer !== undefined
            ? { refinedAnswer: overlayEntryOf(selectedNode.id)!.refinedAnswer }
            : {})}
          onClose={closeCard}
          {...(onOpenCitation ? { onOpenCitation } : {})}
        />
      )}
      <MapLegend />
    </div>
  );
}

function MapGraphNode({
  layoutNode,
  node,
  visualState,
  selected,
  onClick,
}: {
  layoutNode: LayoutNode;
  node: MapNode | undefined;
  visualState: VisualState;
  selected: boolean;
  /** Passed the click event so the caller can read `currentTarget`'s own
   *  screen rect -- the node button IS the popover anchor (module header). */
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}): React.JSX.Element {
  const label = layoutNode.isRegion
    ? `${node?.question ?? layoutNode.id} (${String(layoutNode.regionCount)} mastered)`
    : (node?.question ?? layoutNode.id);
  return (
    <button
      type="button"
      className={`map-node map-node-${visualState}${layoutNode.isRegion ? " map-node-region" : ""}${selected ? " map-node-selected" : ""}`}
      style={{
        left: layoutNode.x - layoutNode.width / 2,
        top: layoutNode.y - layoutNode.height / 2,
        width: layoutNode.width,
        height: layoutNode.height,
      }}
      onClick={onClick}
      title={label}
    >
      <span className="map-node-tag">{layoutNode.isRegion ? "region" : visualState}</span>
      <span className="map-node-label">{label}</span>
    </button>
  );
}

function MapLegend(): React.JSX.Element {
  const entries: { cls: VisualState; label: string }[] = [
    { cls: "demonstrated", label: "demonstrated" },
    { cls: "grasped", label: "grasped" },
    { cls: "in-play", label: "in play" },
    { cls: "frontier", label: "up next" },
    { cls: "shaky", label: "shaky" },
    { cls: "invalidated", label: "code changed" },
  ];
  return (
    <div className="map-legend">
      {entries.map((e) => (
        <span key={e.cls}>
          <i className={`map-legend-swatch map-node-${e.cls}`} /> {e.label}
        </span>
      ))}
    </div>
  );
}
