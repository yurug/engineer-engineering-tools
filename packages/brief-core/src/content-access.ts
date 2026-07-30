// Module: content-access -- the minimal, structural interfaces citation
// minting/validation actually consume.
//
// WHY these are narrower than backbrief's own `RepoAccess`/`KbAccess`
// (kb/external/backbrief-internals.md gap found at plan step 1: the
// citation modules imported those full interfaces, which also carry
// backbrief-only concerns -- directory listing, diff hunks, git-tree
// traversal -- composed from modules ADR-001 explicitly keeps OUT of core,
// e.g. `repo-tree.ts`/`diff.ts`). Citation minting/validation only ever
// calls `readAtRev`/`readFile`, so core defines interfaces with exactly
// that shape. Any wider object (backbrief's real `RepoAccess`/`KbAccess`)
// satisfies these structurally with zero adapter code -- TypeScript
// structural typing means backbrief's existing call sites need no changes
// at all, only their import source does.
export interface CitationRepoAccess {
  /** @returns file content at `rev` ("worktree" means the live filesystem), or null if it does not resolve. */
  readAtRev(rev: string, relPath: string): Promise<string | null>;
}

export interface CitationKbAccess {
  /** @returns file content, or null if it does not exist. */
  readFile(relPath: string): Promise<string | null>;
}
