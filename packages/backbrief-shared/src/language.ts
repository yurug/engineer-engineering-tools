// Module: language -- file-extension -> language-tag mapping.
//
// One lookup table shared by two consumers per kb/architecture/overview.md's
// dependency rule ("if a function has no I/O, it belongs in shared where
// it's property-testable"): server/src/api/file.ts returns the tag as a
// hint in `GET /api/file`'s response, and packages/web's CodeViewer picks
// the matching CodeMirror 6 language extension from it
// (kb/external/codemirror6.md's package list). Keeping ONE table means the
// server's hint and the viewer's actual highlighting can never disagree.
// Key design decision (P10): an unrecognized extension maps to
// "plaintext", never throws or omits a language -- kb/properties/
// functional.md#P10 requires every text file to render, syntax color or
// not.
export type LanguageTag =
  "javascript" | "python" | "rust" | "shell" | "ocaml" | "markdown" | "json" | "plaintext";

/** Extension (including the leading dot, lowercase) -> language tag. */
const EXTENSION_MAP: Readonly<Record<string, LanguageTag>> = {
  ".ts": "javascript",
  ".tsx": "javascript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".pyi": "python",
  ".rs": "rust",
  ".sh": "shell",
  ".bash": "shell",
  ".zsh": "shell",
  // @codemirror/legacy-modes' mllike covers OCaml -- no first-class Lezer
  // grammar exists (kb/external/codemirror6.md).
  ".ml": "ocaml",
  ".mli": "ocaml",
  ".md": "markdown",
  ".markdown": "markdown",
  ".json": "json",
  ".jsonc": "json",
};

/**
 * @param repoRelativePath a repo-relative path (e.g. "packages/server/src/repo.ts")
 * @returns the language tag for syntax highlighting, or "plaintext" if the
 *   extension is unrecognized or the file has none (P10 fallback)
 * @invariant P10 never throws; every path maps to SOME tag
 * @example detectLanguage("kb/spec/algorithms.md") === "markdown"
 */
export function detectLanguage(repoRelativePath: string): LanguageTag {
  const lastSlash = repoRelativePath.lastIndexOf("/");
  const basename = lastSlash === -1 ? repoRelativePath : repoRelativePath.slice(lastSlash + 1);
  const dot = basename.lastIndexOf(".");
  // dot <= 0 covers "no extension" (dot === -1) AND dotfiles like
  // ".gitignore" (dot === 0, where the whole basename IS the "extension").
  if (dot <= 0) return "plaintext";
  const ext = basename.slice(dot).toLowerCase();
  return EXTENSION_MAP[ext] ?? "plaintext";
}
