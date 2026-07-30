// Module: lib/tree-flatten -- pure flattening of a lazily-loaded directory
// map into the flat row list FileTree.tsx feeds to VirtualList.
//
// Split out as a pure function (no React, no fetch) so the row-ordering
// logic is unit-testable without mounting a component or mocking fetch --
// kb/conventions/testing-strategy.md's unit level.
import type { TreeEntry } from "./browse-api";

export interface TreeRow {
  path: string;
  name: string;
  kind: "file" | "dir";
  depth: number;
}

/**
 * @param childrenByPath every directory path's already-fetched children
 *   (root is the empty string `""`) -- a directory absent from this map is
 *   treated as not-yet-loaded and contributes no rows of its own
 * @param expandedPaths directories currently expanded in the UI
 * @returns the visible rows in display order (depth-first, each
 *   directory's children immediately following it when expanded)
 */
export function flattenTree(
  childrenByPath: ReadonlyMap<string, readonly TreeEntry[]>,
  expandedPaths: ReadonlySet<string>,
): TreeRow[] {
  return flattenFrom("", 0, childrenByPath, expandedPaths);
}

function flattenFrom(
  dirPath: string,
  depth: number,
  childrenByPath: ReadonlyMap<string, readonly TreeEntry[]>,
  expandedPaths: ReadonlySet<string>,
): TreeRow[] {
  const children = childrenByPath.get(dirPath) ?? [];
  const rows: TreeRow[] = [];
  for (const entry of children) {
    rows.push({ path: entry.path, name: entry.name, kind: entry.kind, depth });
    if (entry.kind === "dir" && expandedPaths.has(entry.path)) {
      rows.push(...flattenFrom(entry.path, depth + 1, childrenByPath, expandedPaths));
    }
  }
  return rows;
}
