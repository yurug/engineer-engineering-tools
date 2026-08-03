// Module: cli/sse-events -- shared inbound human-event pump for every brief CLI.
//
// The browser-to-agent wake-up path used to be reimplemented by each tool.
// That made the most important behavior diverge: some consumers returned on
// the first event (waking an exit-notification-only host), while others held
// the stream until the timeout. Keep the transport rule here instead.
import type { Actor, Envelope } from "@brief/shared";

export interface PumpSseEventOptions {
  actor?: Actor;
  exitAfterFirstMatch: boolean;
  writeEnvelope: (json: string) => void;
}

/**
 * Pump envelope frames in wire order, optionally selecting one actor.
 * @returns the last matching envelope, or null when the stream ended empty
 * @invariant when exitAfterFirstMatch is true, non-matching traffic never wakes
 *   the caller; the first matching envelope is written before this returns
 */
export async function pumpSseEvents(
  body: ReadableStream<Uint8Array>,
  options: PumpSseEventOptions,
): Promise<Envelope | null> {
  let buffer = "";
  let last: Envelope | null = null;
  for await (const chunk of body) {
    buffer += Buffer.from(chunk).toString("utf8");
    let boundary: number;
    while ((boundary = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const json = envelopeData(block);
      if (json === null) continue;
      const envelope = JSON.parse(json) as Envelope;
      if (options.actor !== undefined && envelope.actor !== options.actor)
        continue;
      options.writeEnvelope(json);
      last = envelope;
      if (options.exitAfterFirstMatch) return last;
    }
  }
  return last;
}

function envelopeData(block: string): string | null {
  const lines = block.split("\n");
  const eventLine = lines.find((line) => line.startsWith("event: "));
  if (eventLine?.slice("event: ".length) !== "envelope") return null;
  const dataLines = lines
    .filter((line) => line.startsWith("data: "))
    .map((line) => line.slice("data: ".length));
  return dataLines.length > 0 ? dataLines.join("\n") : null;
}
