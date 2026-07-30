// Module: app -- wires every route onto one Hono app.
//
// Pure composition (mirrors @backbrief/server's own app.ts, ADR-001): "which
// path maps to which handler" plus the two cross-cutting middlewares (auth,
// error mapping), both supplied by @brief/core.
import { Hono } from "hono";
import {
  authMiddleware,
  makeErrorResponder,
  type CitationRepoAccess,
  type CitationKbAccess,
  type EventStore,
  type PresenceSink,
  type Tokens,
} from "@brief/core";
import type { Clock, IdGenerator } from "@brief/shared";
import { FOREBRIEF_ERROR_STATUS } from "./error-taxonomy";
import { stateRoute } from "./api/state";
import { stopRoute } from "./api/stop";
import { roundsRoute } from "./api/rounds";
import { cardsRoute } from "./api/cards";
import { recordsRoute } from "./api/records";
import { eventsRoute, eventsFollowRoute } from "./api/events";
import { digestRoute } from "./api/digest";

export interface AppDeps {
  tokens: Tokens;
  repoRoot: string;
  eventStore: EventStore;
  repo: CitationRepoAccess;
  kb: CitationKbAccess;
  clock: Clock;
  ids: IdGenerator;
  sessionId: string;
  /** Schedules shutdown -- see api/stop.ts's own doc. */
  onStop: () => void;
}

/** Step 1/2 have no presence/dwell tracking yet -- a no-op sink satisfies
 *  core's authMiddleware, the SSE follow route, and (step 3) the WS hub
 *  (server.ts), which all require SOME markSeen callback. Exported so
 *  server.ts's `attachWsHub` wiring shares the exact same no-op instead of
 *  declaring a second one. */
export const NO_OP_PRESENCE: PresenceSink = { markSeen: () => undefined };

export function buildApp(deps: AppDeps): Hono {
  const app = new Hono();
  app.use("/api/*", authMiddleware(deps.tokens, NO_OP_PRESENCE));
  app.onError(makeErrorResponder(FOREBRIEF_ERROR_STATUS));

  app.get("/api/state", stateRoute(deps));
  app.post(
    "/api/stop",
    stopRoute({
      repoRoot: deps.repoRoot,
      eventStore: deps.eventStore,
      repo: deps.repo,
      kb: deps.kb,
      onStop: deps.onStop,
    }),
  );
  app.post("/api/rounds", roundsRoute(deps));
  app.post("/api/cards", cardsRoute(deps));
  app.post("/api/records", recordsRoute({ ...deps, sessionId: deps.sessionId }));
  app.get("/api/events", eventsRoute(deps));
  app.get(
    "/api/events/follow",
    eventsFollowRoute({ eventStore: deps.eventStore, presence: NO_OP_PRESENCE }),
  );
  app.get("/api/digest", digestRoute(deps));

  return app;
}
