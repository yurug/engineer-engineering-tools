// Module: kb-ref -- pure detection of "kb/....md[#anchor]" references inside
// arbitrary file text, so GET /api/file can annotate them as spans the web
// Code activity turns into clickable, hover-carded links.
//
// Implements kb/plan.md step 3's Code activity: "comments citing kb/ paths
// become links... detection: literal 'kb/...md' optionally '#anchor'
// occurrences; keep it dumb and precise." Deliberately NOT comment-aware --
// no per-language grammar is loaded to find "this is inside a comment"; the
// pattern itself is precise enough (word-boundary guard, mandatory `.md`,
// a closed anchor character class) that scanning raw text produces no
// false positives worth the cost of a second, language-specific parser.
// This is detection ONLY: it grants no read access by itself -- the
// existing `isWithinKbDir` check in server/kb.ts (unchanged) is what a
// hover card's actual `GET /api/kb` fetch is gated by, so a span pointing
// outside the KB (or at a file that doesn't exist) just 404s harmlessly at
// fetch time instead of being rejected here.
export interface KbRefSpan {
  /** 1-based -- matches Citation.startLine / CodeViewer's `jumpToLine` convention. */
  line: number;
  /** 0-based character offset within the line -- a CM6 decoration adds this to `state.doc.line(line).from` directly (kb/external/codemirror6.md's Decoration-from-StateField shape). */
  col: number;
  /** The matched "kb/....md" path, unresolved. */
  path: string;
  /** The "#anchor" suffix, without the leading "#", when present. */
  anchor?: string;
}

// (?<![\w/]) -- guards against matching mid-token inside a longer slash
// path (e.g. "notkb/x.md" or a nested "sub/kb/x.md" mention that isn't
// actually rooted at "kb/") by requiring the character immediately before
// "kb/" to be neither a word character nor another slash, or the start of
// the line. "kb/" then a run of ordinary path characters ending in the
// literal ".md" every KB file has (kb/conventions' own naming rule) --
// trailing prose punctuation (`)`, `,`, `.`, a closing backtick) is outside
// this character class, so it is never swallowed into the match. The
// anchor, if present, is a SEPARATE capture with its own closed class so a
// sentence like "...md#recovery." stops the match at "recovery", leaving
// the trailing "." as plain text.
const KB_REF_PATTERN = /(?<![\w/])kb\/[A-Za-z0-9_\-./]*\.md(?:#([A-Za-z0-9_-]+))?/g;

/**
 * @param content the raw file text, any language (comment-blind, see module header)
 * @returns every "kb/....md[#anchor]" span found, in document order
 * @invariant pure -- no I/O, no filesystem/path validation; server/api/
 *   file.ts calls this over content it has already read and returns the
 *   spans alongside it; web never calls it directly
 */
export function detectKbRefs(content: string): KbRefSpan[] {
  const spans: KbRefSpan[] = [];
  const lines = content.split("\n");
  for (const [index, lineText] of lines.entries()) {
    spans.push(...spansInLine(lineText, index + 1));
  }
  return spans;
}

/** One line's worth of matches -- split out so `detectKbRefs` stays inside code-style.md's 30-line function budget. */
function spansInLine(lineText: string, line: number): KbRefSpan[] {
  const spans: KbRefSpan[] = [];
  KB_REF_PATTERN.lastIndex = 0; // a shared global-flag regex is stateful across calls -- reset per line
  let match: RegExpExecArray | null;
  while ((match = KB_REF_PATTERN.exec(lineText)) !== null) {
    const full = match[0];
    const anchor = match[1];
    const path = anchor ? full.slice(0, full.indexOf("#")) : full;
    spans.push({ line, col: match.index, path, ...(anchor !== undefined ? { anchor } : {}) });
  }
  return spans;
}
