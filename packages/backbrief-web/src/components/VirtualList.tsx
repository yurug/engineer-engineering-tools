// Component: VirtualList -- fixed-row-height windowed rendering.
//
// kb/plan.md step 2: "file tree (virtualized, lazy)". A small, dependency-
// free virtualizer rather than pulling in react-window (no external
// virtualization library is named anywhere in kb/external/INDEX.md, and
// this component's needs -- one fixed row height, one scrollable list --
// don't warrant a new dependency + its own external/*.md research file).
// Key design decision: `height` is a caller-supplied PIXEL number, never
// measured from the DOM via ResizeObserver/getBoundingClientRect -- jsdom
// (the component-test environment, kb/conventions/testing-strategy.md)
// reports zero for all layout geometry, which would make a measurement-
// based approach untestable without a real browser. An explicit height
// prop keeps this component's windowing math deterministic everywhere.
import { useState } from "react";

export interface VirtualListProps<T> {
  items: readonly T[];
  itemHeight: number;
  /** Visible viewport height in px -- caller-supplied, see module header. */
  height: number;
  /** Extra rows rendered above/below the visible window, absorbing fast scroll jank. */
  overscan?: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  /** Stable key per item -- falls back to index if omitted (fine for a static list, risky for a reordering one). */
  keyOf?: (item: T, index: number) => string;
}

export function VirtualList<T>({
  items,
  itemHeight,
  height,
  overscan = 5,
  renderItem,
  keyOf,
}: VirtualListProps<T>): React.JSX.Element {
  const [scrollTop, setScrollTop] = useState(0);

  const visibleCount = Math.ceil(height / itemHeight);
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(items.length, startIndex + visibleCount + overscan * 2);
  const visibleItems = items.slice(startIndex, endIndex);

  return (
    <div
      className="virtual-list"
      style={{ height, overflowY: "auto", position: "relative" }}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      data-testid="virtual-list"
    >
      {/* A full-height spacer gives the scrollbar the TRUE total extent,
          even though only `visibleItems` ever mount -- the standard
          "absolute-positioned rows inside a tall spacer" virtualization shape. */}
      <div style={{ height: items.length * itemHeight, position: "relative" }}>
        {visibleItems.map((item, i) => {
          const index = startIndex + i;
          return (
            <div
              key={keyOf ? keyOf(item, index) : index}
              style={{
                position: "absolute",
                top: index * itemHeight,
                height: itemHeight,
                width: "100%",
              }}
            >
              {renderItem(item, index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
