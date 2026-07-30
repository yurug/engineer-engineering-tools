// Module: kb-frontmatter -- parses the `---...---` YAML-ish block every
// this-project KB file starts with (kb/CLAUDE.md's KB Document Quality
// Standards: id/type/summary/domain/tags/last-updated/depends-on/refines/
// related).
//
// Deliberately NOT a general YAML parser: every KB file in this repo (see
// any file under kb/) uses exactly two shapes -- `key: bare value` and
// `key: [item, item, ...]` -- so a line-oriented parser is exact for this
// project's own convention and avoids adding a YAML dependency for a
// narrow, fully-controlled format (the same reasoning kb-access.ts's own
// header gives for skipping a markdown AST library).
export type FrontmatterValue = string | string[];
export type Frontmatter = Record<string, FrontmatterValue>;

const FRONTMATTER_BLOCK = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const KEY_VALUE_LINE = /^([A-Za-z0-9_-]+):\s*(.*)$/;

export interface ParsedKbFile {
  frontmatter: Frontmatter;
  /** The markdown with the frontmatter block stripped -- what the client should render. */
  body: string;
}

/**
 * @param markdown the raw KB file content, frontmatter block first (or absent)
 * @returns the parsed key/value frontmatter and the remaining body
 * @invariant a file with no frontmatter block parses as `{frontmatter: {}, body: markdown}` -- never throws
 */
export function parseKbFrontmatter(markdown: string): ParsedKbFile {
  const match = FRONTMATTER_BLOCK.exec(markdown);
  if (!match) return { frontmatter: {}, body: markdown };
  const block = match[1] ?? "";
  const frontmatter: Frontmatter = {};
  for (const line of block.split(/\r?\n/)) {
    const kv = KEY_VALUE_LINE.exec(line);
    if (!kv) continue; // tolerant: a malformed line is skipped, not fatal (this is prose, not a wire format)
    const [, key, rawValue] = kv;
    if (key === undefined) continue;
    frontmatter[key] = parseValue((rawValue ?? "").trim());
  }
  return { frontmatter, body: markdown.slice(match[0].length) };
}

function parseValue(raw: string): FrontmatterValue {
  if (raw.startsWith("[") && raw.endsWith("]")) {
    const inner = raw.slice(1, -1).trim();
    return inner === "" ? [] : inner.split(",").map((item) => item.trim());
  }
  return raw;
}
