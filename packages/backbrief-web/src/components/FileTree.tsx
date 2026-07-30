// Component: FileTree -- lazy, virtualized directory browser.
//
// kb/plan.md step 2: "file tree (virtualized, lazy)". Lazy: a directory's
// children are fetched from `GET /api/tree` only when first expanded
// (NF3 -- server/src/coverage.ts is the one endpoint allowed to walk the
// whole tree, this component must not defeat that by eagerly expanding
// everything). Virtualized: rendering goes through VirtualList so a 5k-
// file repo's fully-expanded tree never mounts 5k DOM nodes at once.
// One tree serves BOTH code and KB browsing -- `kb/` is an ordinary
// subtree of the repo (architecture/overview.md), so no separate KB tree
// exists; onSelect's caller (BrowsePane) decides code-viewer vs. kb-viewer
// by path prefix.
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchTree, type TreeEntry } from "../lib/browse-api";
import type { ApiConfig } from "../lib/api";
import { flattenTree, type TreeRow } from "../lib/tree-flatten";
import { VirtualList } from "./VirtualList";

const ROW_HEIGHT_PX = 22;
const VIEWPORT_HEIGHT_PX = 360;

export function FileTree({
  api,
  selectedPath,
  onSelect,
}: {
  api: ApiConfig;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}): React.JSX.Element {
  const [childrenByPath, setChildrenByPath] = useState<Map<string, TreeEntry[]>>(new Map());
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

  const loadDir = useCallback(
    (dirPath: string) => {
      setChildrenByPath((prev) => {
        if (prev.has(dirPath)) return prev; // already loaded (or loading) -- lazy means "fetch once"
        void fetchTree(api, dirPath).then((entries) => {
          setChildrenByPath((current) => new Map(current).set(dirPath, entries));
        });
        return new Map(prev).set(dirPath, []); // placeholder so a concurrent call doesn't double-fetch
      });
    },
    [api],
  );

  // Root level loads on mount -- everything past it is lazy (NF3).
  useEffect(() => loadDir(""), [loadDir]);

  const toggle = useCallback(
    (row: TreeRow) => {
      if (row.kind === "file") {
        onSelect(row.path);
        return;
      }
      setExpandedPaths((prev) => {
        const next = new Set(prev);
        if (next.has(row.path)) next.delete(row.path);
        else {
          next.add(row.path);
          loadDir(row.path);
        }
        return next;
      });
    },
    [loadDir, onSelect],
  );

  const rows = useMemo(
    () => flattenTree(childrenByPath, expandedPaths),
    [childrenByPath, expandedPaths],
  );

  return (
    <VirtualList
      items={rows}
      itemHeight={ROW_HEIGHT_PX}
      height={VIEWPORT_HEIGHT_PX}
      keyOf={(row) => row.path}
      renderItem={(row) => (
        <button
          type="button"
          className={`tree-row${row.path === selectedPath ? " tree-row-selected" : ""}`}
          style={{ paddingLeft: row.depth * 14 }}
          onClick={() => toggle(row)}
        >
          <span className="tree-row-icon" aria-hidden="true">
            {row.kind === "dir" ? (expandedPaths.has(row.path) ? "▾" : "▸") : "·"}
          </span>
          {row.name}
        </button>
      )}
    />
  );
}
