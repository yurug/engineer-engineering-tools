// Module: lib/language-cm6 -- LanguageTag (shared/src/language.ts) -> a
// CodeMirror 6 language extension.
//
// kb/external/codemirror6.md: "core... plus one package per language...
// legacy-modes (provides shell and mllike for OCaml -- no first-class
// Lezer OCaml grammar exists, legacy-mode highlighting is acceptable, P10
// fallback is plain text)." This is the one place that maps the server's
// `language` hint (GET /api/file's response, from shared's detectLanguage)
// to an actual CM6 `Extension` -- CodeViewer.tsx only calls this, never
// picks a language package itself.
import type { Extension } from "@codemirror/state";
import { StreamLanguage } from "@codemirror/language";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import { markdown } from "@codemirror/lang-markdown";
import { oCaml } from "@codemirror/legacy-modes/mode/mllike";
import { shell } from "@codemirror/legacy-modes/mode/shell";

/**
 * @param languageTag the tag `GET /api/file`/`GET /api/kb` return
 *   (shared/src/language.ts's LanguageTag) -- an unrecognized or
 *   "plaintext" tag returns `[]` (no language extension), which is CM6's
 *   own plain-text mode (P10 fallback, kb/external/codemirror6.md:
 *   "Missing grammar for a language -> plain-text fallback must be
 *   automatic").
 * @returns a CM6 extension array to include in the EditorState
 */
export function languageExtension(languageTag: string): Extension[] {
  switch (languageTag) {
    case "javascript":
      return [javascript({ jsx: true, typescript: true })];
    case "python":
      return [python()];
    case "rust":
      return [rust()];
    case "markdown":
      return [markdown()];
    case "ocaml":
      return [StreamLanguage.define(oCaml)];
    case "shell":
      return [StreamLanguage.define(shell)];
    default:
      // "json" and "plaintext" both fall through here -- JSON has no
      // dedicated grammar shipped (kb/external/codemirror6.md lists the
      // languages we ship; JSON wasn't one of them), and plaintext is P10's
      // explicit fallback. Both render as plain text, which is correct for
      // json too (a highlighted-but-wrong JSON grammar is worse than none).
      return [];
  }
}
