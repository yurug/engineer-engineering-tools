// Module: lib/markdown -- the one configured markdown-it instance for
// rendering agent-authored card bodies.
//
// Implements kb/external/markdown-rendering.md exactly: "`html: false`
// (markdown-it default): raw HTML in source renders as escaped text. This
// is sanitization by construction -- do NOT enable `html: true` and add
// DOMPurify instead." Card markdown is untrusted input on a token-
// authenticated page (a script injected through a card could exfiltrate
// the token from the URL), so this configuration is a security boundary,
// not a style choice -- kb/runbooks/audit-checklist.md's security axis
// greps for `html: true` / `dangerouslySetInnerHTML` outside this file.
// `linkify: false` per the same doc; explicit markdown links `[text](url)`
// still render (linkify only controls AUTO-linking bare URLs in text) and
// get rel="noopener noreferrer" + target="_blank" via the renderer rule
// override below. No syntax-highlighting hook is configured -- that is
// step 2's CodeMirror/Lezer integration (architecture/overview.md); code
// blocks render as plain, safely-escaped `<pre><code>` until then.
import MarkdownIt from "markdown-it";
import { githubHeadingSlug } from "@backbrief/shared/browser";

const md: MarkdownIt = new MarkdownIt({ html: false, linkify: false });

// VERIFY (ext-markdown.md's agent note): markdown-it's default
// `validateLink` blocks javascript:/vbscript:/data: URL schemes -- checked
// against markdown-it 14.3.0's source (lib/common/utils.js) during this
// step; re-verify on any markdown-it upgrade.
const defaultLinkOpen =
  md.renderer.rules.link_open ??
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  token?.attrSet("rel", "noopener noreferrer");
  token?.attrSet("target", "_blank");
  return defaultLinkOpen(tokens, idx, options, env, self);
};

/** @returns sanitized-by-construction HTML for a card's markdown body. */
export function renderCardMarkdown(markdown: string): string {
  return md.render(markdown);
}

// KB heading anchors -- step 2. `GET /api/kb`'s `anchors` list is computed
// server-side by shared/src/heading-slug.ts's SAME `githubHeadingSlug`
// function; injecting matching `id` attributes here (not in
// renderCardMarkdown's path -- cards are agent-authored prose, not KB
// files with a stable anchor contract) is what makes "jump to #anchor"
// resolvable via `document.getElementById`. `headingIdSeenCounts` is
// reset per `renderKbMarkdown` call (not per-heading-token or module-
// global) so slug de-duplication counts restart for every distinct KB
// file, matching headingSlugsOf's own per-document contract.
let headingIdSeenCounts: Map<string, number> | null = null;
const defaultHeadingOpen =
  md.renderer.rules.heading_open ??
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.heading_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const inlineToken = tokens[idx + 1]; // markdown-it: heading_open, inline (the heading text), heading_close
  if (token && inlineToken && headingIdSeenCounts) {
    token.attrSet("id", githubHeadingSlug(inlineToken.content, headingIdSeenCounts));
  }
  return defaultHeadingOpen(tokens, idx, options, env, self);
};

/** @returns sanitized HTML for a KB file's body, with heading `id`s matching `GET /api/kb`'s `anchors` list. */
export function renderKbMarkdown(markdown: string): string {
  headingIdSeenCounts = new Map();
  try {
    return md.render(markdown);
  } finally {
    headingIdSeenCounts = null;
  }
}
