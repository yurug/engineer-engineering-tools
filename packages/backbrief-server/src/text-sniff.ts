// Module: text-sniff -- binary detection + UTF-8 validity sniffing for the
// file viewer, per kb/properties/edge-cases.md#T3/#T4.
//
// T4: "Binary (NUL sniff) -> E_BINARY, download link." T3: "invalid UTF-8
// bytes... lossy replacement for invalid bytes, flagged in UI." Split out
// of api/file.ts so both rules are unit-testable on raw Buffers without an
// HTTP context, and reusable if a future endpoint needs the same sniff.
const BINARY_SNIFF_WINDOW_BYTES = 8_000; // git's own NUL-in-first-8000-bytes heuristic

/**
 * @returns true if `buffer`'s first `BINARY_SNIFF_WINDOW_BYTES` contain a
 *   NUL byte -- the standard, cheap "is this binary" heuristic (matches
 *   `git`'s own default, so backbrief's binary/text split agrees with the
 *   repo's own diff/text handling)
 */
export function looksBinary(buffer: Buffer): boolean {
  const window = buffer.subarray(0, BINARY_SNIFF_WINDOW_BYTES);
  return window.includes(0);
}

export interface DecodedText {
  content: string;
  /** "utf8-lossy" when the source bytes were not valid UTF-8 -- T3: "flagged in UI", never silently accepted as clean. */
  encoding: "utf8" | "utf8-lossy";
}

/**
 * Decodes `buffer` as UTF-8, distinguishing "valid" from "had to replace
 * invalid bytes" so the caller can flag the latter (T3) rather than
 * silently rendering mangled text as if it were clean.
 * @invariant T3 always returns SOME string (never throws) -- invalid bytes
 *   become U+FFFD replacement characters, matching "lossy replacement...
 *   flagged in UI", not a viewer error
 */
export function decodeUtf8(buffer: Buffer): DecodedText {
  try {
    // fatal: true rejects on the first invalid byte sequence -- the only
    // way to detect "was this valid UTF-8" distinctly from "did decoding
    // produce readable text" (a lossy decode always succeeds, by design).
    const content = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    return { content, encoding: "utf8" };
  } catch {
    const content = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
    return { content, encoding: "utf8-lossy" };
  }
}
