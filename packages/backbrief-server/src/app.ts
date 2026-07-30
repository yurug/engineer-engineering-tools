// Module: app -- wires every route onto one Hono app.
//
// This file is pure composition: it owns no logic of its own beyond
// "which path maps to which handler" and the two cross-cutting middlewares
// (auth, error mapping). Every handler is built in its own api/* module and
// injected with exactly the dependencies it needs (DI, code-style.md) --
// this file is where those dependency sets are assembled from the single
// `AppDeps` bag server.ts constructs.
import { Hono } from "hono";
import type { Clock, Envelope } from "@backbrief/shared";
import { authMiddleware, toErrorResponse } from "./api/middleware";
import { actionsRoute } from "./api/actions";
import { getEventsRoute, followEventsRoute, postEventsRoute } from "./api/events";
import { getSessionRoute, endSessionRoute } from "./api/session";
import { stateDigestRoute } from "./api/digest";
import { treeRoute } from "./api/tree";
import { fileRoute } from "./api/file";
import { kbRoute } from "./api/kb";
import { glossaryRoute } from "./api/glossary";
import { searchRoute } from "./api/search";
import { annotationsRoute } from "./api/annotations";
import { coverageRoute } from "./api/coverage";
import { revalidateRoute } from "./api/revalidate";
import { diffRoute } from "./api/diff";
import { mapRoute } from "./api/map";
import type { EventStore } from "./store/event-store";
import type { AnnotationStore } from "./store/annotation-store";
import type { ReaderStateStore } from "./store/reader-state-store";
import type { ModelStore } from "./store/model-store";
import type { RepoAccess } from "./repo";
import type { KbAccess } from "./kb-access";
import type { SessionState } from "./session-state";
import type { Presence } from "./presence";
import type { Tokens } from "./auth";
import type { Config } from "./store/config";
import type { WsHub } from "./ws/hub";
import type { TelemetryCounters } from "./telemetry-counters";

export interface AppDeps {
  tokens: Tokens;
  presence: Presence;
  eventStore: EventStore;
  annotationStore: AnnotationStore;
  readerStateStore: ReaderStateStore;
  /** v2 (ADR-005): the comprehension map + overlay -- store/model-store.ts. */
  modelStore: ModelStore;
  repo: RepoAccess;
  kb: KbAccess;
  sessionState: SessionState;
  clock: Clock;
  repoRoot: string;
  config: Config;
  /** Step 3: lets api/revalidate.ts push validation_update to every connected tab, and (server.ts) lets the HEAD watcher do the same. */
  wsHub: WsHub;
  /** Step 3 (T2/E_KB_MISSING): computed once at startup per config-and-formats.md#kb-detection -- `ask_question` (P9) is rejected outright in this mode, since no KB anchor could ever be valid. */
  noKbMode: boolean;
  /** v2 step 4 (NF6): api/actions.ts's present_move guard increments this on every E_OVER_BUDGET rejection; api/session.ts reads it at session_end (telemetry-counters.ts). */
  telemetryCounters: TelemetryCounters;
  /** Projects one freshly-appended envelope into the derived annotation/
   *  reader-state stores -- server.ts's composition closes over the live
   *  session id so route handlers never need to pass it explicitly. Called
   *  synchronously (awaited) by actions.ts/events.ts right after a
   *  successful (non-deduped) append, so a GET immediately after a POST
   *  always observes the update (no eventually-consistent window). */
  projectEnvelope: (envelope: Envelope) => Promise<void>;
  onEnded: () => void;
}

export function buildApp(deps: AppDeps): Hono {
  const app = new Hono();
  // Scoped to /api/* only -- NOT `"*"`. The static web SPA (mounted
  // separately, after this function returns -- see server.ts) is loaded by
  // the BROWSER itself via plain `<script src>`/`<link>` tags, which never
  // carry the bearer token (there is no way to attach one without a
  // service-worker fetch interceptor, well past this step's scope). The
  // app shell (HTML/JS/CSS) holds no secrets -- the token lives only in
  // the URL the human was handed and in the app's own fetch/WS calls made
  // AFTER it loads, which DO carry it. Gating the shell itself would make
  // the browser unable to load its own JS: a real bug found by manually
  // serving the built web app and watching the JS asset request come back 401.
  app.use("/api/*", authMiddleware(deps.tokens, deps.presence));
  app.onError(toErrorResponse);

  app.post("/api/actions", actionsRoute(deps));
  app.get("/api/events", getEventsRoute(deps));
  app.get("/api/events/follow", followEventsRoute(deps));
  app.post("/api/events", postEventsRoute(deps));
  app.get("/api/session", getSessionRoute(deps));
  app.post("/api/session/end", endSessionRoute(deps));
  app.get("/api/state-digest", stateDigestRoute(deps));

  // Step 2: comprehension surfaces (kb/plan.md).
  app.get("/api/tree", treeRoute(deps));
  app.get("/api/file", fileRoute(deps));
  app.get("/api/kb", kbRoute(deps));
  // Round-7 (ADR-007, US15): glossary term cards' data source.
  app.get("/api/glossary", glossaryRoute(deps));
  app.get("/api/search", searchRoute(deps));
  app.get("/api/annotations", annotationsRoute(deps));
  app.get("/api/coverage", coverageRoute(deps));

  // Step 3: HEAD-change handling (algorithms.md#head-change-handling).
  app.post("/api/revalidate", revalidateRoute(deps));

  // Step 4: diff mode (kb/plan.md).
  app.get("/api/diff", diffRoute(deps));

  // v2 step 1 (ADR-005): the comprehension map read surface.
  app.get("/api/map", mapRoute(deps));

  return app;
}
