// Module: sse -- a minimal Server-Sent Events frame parser over a fetch
// response body stream.
//
// This is the riskiest piece of step 1 (kb/plan.md's "biggest unknown"):
// `backbrief events --follow` is the agent's entire inbound push channel
// (ADR-001), and it has to work whether the host notices background
// process output per-line or only on exit (kb/external/claude-code-agent-
// runtime.md). This module only parses the wire format; ../commands/events.ts
// is where the two modes (bare --follow vs --follow --timeout, the
// chunked-follow fallback) are built on top of it.
// No dependency was added for this (ADR-004's named set doesn't include an
// SSE client) -- the wire format is a handful of lines long and a hand
// parser keeps the CLI's dependency graph exactly `@backbrief/{shared,server}`.
export interface SseFrame {
  event?: string;
  data: string;
}

/**
 * @param body the fetch Response's body stream
 * @yields one frame per blank-line-delimited SSE record, in arrival order
 * @invariant streams incrementally -- a frame is yielded the moment its
 *   terminating blank line is seen, not batched until the connection closes
 *   (this is what makes `--follow` a live push channel rather than a poll)
 */
export async function* parseSseStream(body: ReadableStream<Uint8Array>): AsyncGenerator<SseFrame> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary: number;
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        const frame = parseFrame(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
        if (frame) yield frame;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** One record: zero or more `field: value` lines. We only emit/consume `event` and `data`. */
function parseFrame(raw: string): SseFrame | null {
  let event: string | undefined;
  const dataLines: string[] = [];
  for (const line of raw.split("\n")) {
    if (line.startsWith("event:")) event = line.slice("event:".length).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice("data:".length).replace(/^ /, ""));
  }
  if (dataLines.length === 0) return null;
  // exactOptionalPropertyTypes: omit `event` entirely for a data-only frame
  // rather than setting it to `undefined`.
  return event !== undefined
    ? { event, data: dataLines.join("\n") }
    : { data: dataLines.join("\n") };
}
