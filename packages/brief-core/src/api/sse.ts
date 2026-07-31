// Module: api/sse -- the generic SSE "follow" route scaffold: GET
// .../follow?since=N holds the connection open and streams new envelopes,
// plus a periodic heartbeat.
//
// Extracted from @backbrief/server's `api/events.ts` (ADR-001: "the SSE
// follow-route scaffold"). Only the STREAMING MECHANISM moves -- backbrief's
// original `followEventsRoute` lived in the same file as `getEventsRoute`/
// `postEventsRoute`, which are thick with backbrief-domain event-type gates
// (pedagogy modes, checkpoint acceptance, choice/talk protocols) that stay
// put. This scaffold is generic: it only ever calls `eventStore.readSince`/
// `.subscribe` and `presence.markSeen` -- a consumer wires it to its own
// route path and its own `EventStore`/`PresenceSink`.
import type { Context } from "hono";
import { on, EventEmitter } from "node:events";
import { streamSSE, type SSEStreamingApi } from "hono/streaming";
import type { Envelope } from "@brief/shared";
import type { EventStore } from "../store/event-store";
import type { PresenceSink } from "./middleware";

export interface FollowRouteDeps {
  eventStore: Pick<EventStore, "readSince" | "subscribe">;
  presence: PresenceSink;
}

const FOLLOW_HEARTBEAT_MS = 30_000;

/**
 * `GET .../follow?since=N` -- holds the connection open and streams new
 * envelopes as SSE, plus a periodic heartbeat.
 * @invariant the heartbeat is what makes a long-held follow connection
 *   count as agent presence (a 30s server-side heartbeat)
 */
export function followEventsRoute(deps: FollowRouteDeps) {
  return (c: Context): Response => {
    const since = parseSince(c.req.query("since"));
    const actor = c.get("actor");
    return streamSSE(c, async (stream) => {
      const abortController = new AbortController();
      // Gap-free setup, all synchronous: snapshot, subscribe, THEN start
      // buffering live events via `on()` -- `on()` starts buffering emitted
      // events the instant it's called, before any `for await` consumes
      // them, so nothing emitted while the backlog is still (slowly)
      // sending can be lost.
      const backlog = deps.eventStore.readSince(since);
      const emitter = new EventEmitter();
      const unsubscribe = deps.eventStore.subscribe((envelope) =>
        emitter.emit("item", envelope),
      );
      const liveEvents = on(emitter, "item", {
        signal: abortController.signal,
      });
      const heartbeat = setInterval(() => {
        deps.presence.markSeen(actor);
        emitter.emit("item", null); // null = heartbeat tick, no envelope
      }, FOLLOW_HEARTBEAT_MS);
      stream.onAbort(() => {
        abortController.abort();
        clearInterval(heartbeat);
        unsubscribe();
      });

      for (const envelope of backlog) {
        await writeEnvelope(stream, envelope);
      }
      await pumpUntilAborted(stream, liveEvents, abortController.signal);
      clearInterval(heartbeat);
      unsubscribe();
    });
  };
}

async function pumpUntilAborted(
  stream: SSEStreamingApi,
  liveEvents: AsyncIterable<unknown[]>,
  signal: AbortSignal,
): Promise<void> {
  try {
    for await (const [item] of liveEvents) {
      if (item === null)
        await stream.writeSSE({ event: "heartbeat", data: "" });
      else await writeEnvelope(stream, item as Envelope);
    }
  } catch (error) {
    // `events.on()` rejects with an AbortError when the signal fires --
    // that is the expected way this loop ends on client disconnect.
    if (!signal.aborted) throw error;
  }
}

async function writeEnvelope(
  stream: SSEStreamingApi,
  envelope: Envelope,
): Promise<void> {
  await stream.writeSSE({ event: "envelope", data: JSON.stringify(envelope) });
}

function parseSince(raw: string | undefined): number {
  const n = Number(raw ?? "0");
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
