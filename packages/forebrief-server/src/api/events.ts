// Module: api/events -- GET /api/events (raw JSONL) and GET /api/events/follow
// (SSE), `forebrief events`'s HTTP targets (kb/spec/cli-contract.md).
//
// @invariant P10: raw log reads return stored envelopes UNTOUCHED -- no
// grounding recomputation here (that's GET /api/state and digest only,
// algorithms.md's re-validation triggers).
import type { Context } from "hono";
import type { EventStore, PresenceSink } from "@brief/core";
import { followEventsRoute } from "@brief/core";

export interface EventsRouteDeps {
  eventStore: EventStore;
  presence: PresenceSink;
}

function parseSince(raw: string | undefined): number {
  const n = Number(raw ?? "0");
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** `GET /api/events?since=N` -- one JSON line per envelope, oldest first. */
export function eventsRoute(deps: Pick<EventsRouteDeps, "eventStore">) {
  return (c: Context): Response => {
    const since = parseSince(c.req.query("since"));
    const envelopes = deps.eventStore.readSince(since);
    const body =
      envelopes.map((e) => JSON.stringify(e)).join("\n") + (envelopes.length > 0 ? "\n" : "");
    return c.text(body, 200, { "Content-Type": "application/x-ndjson" });
  };
}

/** `GET /api/events/follow?since=N` -- SSE stream of new envelopes (core's generic scaffold, reused whole). */
export function eventsFollowRoute(deps: EventsRouteDeps) {
  return followEventsRoute({ eventStore: deps.eventStore, presence: deps.presence });
}
