// Module: server -- the composition root: wires every store/validate/api
// module into one running backbrief server instance.
//
// Implements kb/spec/algorithms.md#session-lifecycle's "active" state:
// recover stale artifacts (T7/T8) -> create session -> bind HTTP+WS -> write
// discovery files -> return a handle. This is the ONE function both
// `cli/src/bin/daemon.ts` (real usage, one process per `serve` invocation)
// and integration tests (in-process, many servers per test run) call --
// keeping it a plain async function returning a `close()`-able handle
// (rather than something that calls `process.exit` itself) is what makes it
// usable both ways.
import * as os from "node:os";
import * as path from "node:path";
import type { Server as NodeHttpServer } from "node:http";
import type { Hono } from "hono";
import { serve as serveHttp } from "@hono/node-server";
import {
  AppError,
  systemClock,
  ulidGenerator,
  type Clock,
  type Envelope,
  type Focus,
  type IdGenerator,
} from "@backbrief/shared";
import { makeGitRepoAccess, resolveRepoRoot } from "./repo";
import { resolveBackbriefPath } from "./fsguard";
import { detectNoKbMode, makeFsKbAccess } from "./kb-access";
import { generateTokens } from "./auth";
import { Presence } from "./presence";
import { SessionState } from "./session-state";
import { EventStore } from "./store/event-store";
import { AnnotationStore } from "./store/annotation-store";
import { ReaderStateStore } from "./store/reader-state-store";
import { ModelStore } from "./store/model-store";
import { createSession } from "./store/session-store";
import { runMapStalenessPass } from "./validate/map-staleness";
import {
  buildLaconicWriteHook,
  applyEnvelopeAndFireLaconicWrite,
} from "./laconic/bridge-write-hook";
import type { ProcessRunner as LaconicProcessRunner } from "./laconic/write";
import { TelemetryCounters } from "./telemetry-counters";
import { ensureBackbriefGitignore } from "./store/bootstrap";
import { loadConfig } from "./store/config";
import {
  recoverStaleArtifactsOrThrow,
  removeLock,
  removeServerJson,
  writeLock,
  writeServerJson,
} from "./store/discovery";
import { attachWsHub, type WsHub } from "./ws/hub";
import { buildApp } from "./app";
import { mountStaticWeb } from "./static-web";
import { createVisibleSetTracker } from "./visible-set";
import { startHeadWatcher, type HeadWatcherHandle } from "./watch/head-watcher";
import { startModeWatcher, type ModeWatcherHandle } from "./watch/mode-watcher";

export interface StartServerOptions {
  repoRoot: string;
  title: string;
  focus?: Focus;
  /** Fixed port; omit for a random free port (the default -- NF1 startup speed doesn't need a stable port). */
  port?: number;
  /** Test seam: override the clock/id-generator (DI, code-style.md), the
   *  laconic write-back subprocess runner (write.ts's `ProcessRunner`) so a
   *  test can assert the exact argv without spawning a real python3, and/or
   *  `laconicHomedir` (defaults to real `os.homedir()`) -- home.ts's module
   *  header explains why every laconic path MUST be overridable in tests:
   *  without this seam, `discoverLaconicRecordCmd`'s conventional-path
   *  fallback can find and invoke a REAL `laconic_record.py` against the
   *  REAL `~/.laconic` on any dev machine that happens to have the
   *  laconic-skill checked out -- exactly the incident this seam exists to
   *  make structurally impossible, not just avoided by test discipline. */
  deps?: {
    clock?: Clock;
    ids?: IdGenerator;
    laconicRunProcess?: LaconicProcessRunner;
    laconicHomedir?: string;
  };
  /** Test seam: HEAD-watcher poll interval -- defaults to algorithms.md's 2s; integration tests override to a few ms so T10 assertions don't need real sleeps. */
  watchIntervalMs?: number;
  /** Test seam: mode-watcher poll interval (kb/spec/pedagogy-engine.md's interaction-modes) -- defaults to watch/mode-watcher.ts's 10s; integration tests override to a few ms. */
  modeWatchIntervalMs?: number;
  /** Test seam: override where the built web SPA is looked for -- defaults
   *  to `@backbrief/web`'s real build output, computed relative to this
   *  package's own compiled location (DI, code-style.md: no hardcoded
   *  environment path without an injection point). */
  webDistDir?: string;
}

export interface ServerHandle {
  sessionId: string;
  port: number;
  url: string;
  agentToken: string;
  humanToken: string;
  pid: number;
  close(): Promise<void>;
}

/** @invariant P7 always binds 127.0.0.1, never 0.0.0.0 or a public interface. */
const LOOPBACK_ONLY = "127.0.0.1";

/**
 * @throws {AppError} E_NO_REPO if `repoRoot` is not inside a git repository
 * @throws {AppError} E_ALREADY_RUNNING if a live server already holds this repo (T7)
 * @throws {AppError} E_CONFIG if `.backbrief/config.json` is invalid
 * @invariant T8 stale lock/server.json artifacts are cleaned before a new
 *   session is created
 */
export async function startServer(options: StartServerOptions): Promise<ServerHandle> {
  const clock = options.deps?.clock ?? systemClock;
  const ids = options.deps?.ids ?? ulidGenerator;

  const repoRoot = await resolveRepoRoot(path.resolve(options.repoRoot));
  if (!repoRoot) {
    throw new AppError("E_NO_REPO", `not a git repository: ${options.repoRoot}`, {
      path: options.repoRoot,
    });
  }
  await ensureBackbriefGitignore(repoRoot);
  const config = await loadConfig(repoRoot); // consulted by tree/file/kb/search/coverage endpoints (step 2)
  await recoverStaleArtifactsOrThrow(repoRoot); // T7 (throws) / T8 (cleans) — see discovery.ts

  // PR-B: the same size ceiling the viewer's T4 guard already enforces
  // (api/file.ts) now also bounds worktree citation reads (repo.ts's
  // `readWorktreeFile`) -- one number, one config key, two call sites.
  const repo = makeGitRepoAccess(repoRoot, config.maxFileBytes);
  const kb = makeFsKbAccess(repoRoot);
  const headAtStart = await repo.headRev();
  const session = await createSession(repoRoot, options.title, headAtStart, { clock, ids });
  const sessionState = new SessionState(
    options.focus ? { ...session, focus: options.focus } : session,
  );
  // ADR-001: EventStore.open now takes an already-resolved filePath (core
  // knows nothing about "sessions") -- this package's own naming rule
  // (one log per session) is expressed here, at the one place a LIVE store
  // is opened.
  const eventLogPath = resolveBackbriefPath(repoRoot, path.join("events", `${session.id}.jsonl`));
  const eventStore = await EventStore.open(eventLogPath, { clock, ids });
  // Both derived stores REBUILD from every session's log at open() (P6) --
  // opening them only after `createSession`/`EventStore.open` above is
  // deliberate: this session's OWN (empty-so-far) log already exists on
  // disk by the time they read the session list, so a from-zero fold never
  // race-misses it.
  const annotationStore = await AnnotationStore.open(repoRoot, repo);
  const readerStateStore = await ReaderStateStore.open(repoRoot);
  const modelStore = await ModelStore.open(repoRoot);
  // laconic-bridge.md#write: `recordCmd` is resolved ONCE here (the only
  // I/O in the whole write path) -- `null` means the bridge is explicitly
  // disabled or no recordCmd resolves, and `projectEnvelope` below skips
  // the write path's before/after overlay diff entirely in that case.
  const laconicWriteHook = await buildLaconicWriteHook(
    config,
    process.env,
    options.deps?.laconicHomedir ?? os.homedir(),
    repoRoot,
    () => clock.nowIso(),
    options.deps?.laconicRunProcess,
  );
  const presence = new Presence(clock);
  const tokens = generateTokens();
  const noKbMode = await detectNoKbMode(kb, config); // T2/E_KB_MISSING -- fixed for this session's lifetime
  const visibleSet = createVisibleSetTracker(); // HEAD-watcher revalidation's "currently visible" set (algorithms.md)
  const telemetryCounters = new TelemetryCounters(); // v2 step 4 (NF6): budgetRejections' one live counter, this process's whole lifetime

  // The WS hub can only be ATTACHED once `httpServer` exists, which can
  // only exist once `app` exists (buildApp needs `deps.wsHub` for
  // POST /api/revalidate) -- a genuine circular dependency broken by this
  // forward-reference proxy: every consumer captured in `deps` below holds
  // THIS object forever, but its behavior is filled in once attachWsHub
  // runs, a few lines further down, before anything could call it for real
  // (no request/watcher tick can fire before this function returns a handle).
  let realWsHub: WsHub | null = null;
  const wsHub: WsHub = {
    broadcastValidationUpdate: (updates) => realWsHub?.broadcastValidationUpdate(updates),
    closeAllConnections: () => realWsHub?.closeAllConnections(),
  };

  /** See app.ts's AppDeps -- keeps the derived stores in sync with the one live session's own appends. */
  const projectEnvelope = async (envelope: Envelope): Promise<void> => {
    await annotationStore.apply(session.id, envelope);
    await readerStateStore.applyLive(session.id, envelope);
    // v2 (ADR-005): keeps map.json/overlay.json in sync
    // (comprehension-map.md#storage); laconic-bridge.md#write: also fires
    // the once-only write-back when this envelope is the one that moves a
    // node INTO `demonstrated` -- see applyEnvelopeAndFireLaconicWrite's
    // header for the before/after diff this does.
    await applyEnvelopeAndFireLaconicWrite(modelStore, laconicWriteHook, envelope);
    // algorithms.md's "visible set = paths in each connected client's
    // latest navigation: opened events" -- tracked here so it's populated
    // from BOTH the browser's own POST /api/events and any other path a
    // navigation envelope could arrive through, with no separate listener.
    if (envelope.type === "navigation") {
      const payload = envelope.payload as { path: string; kind: string };
      if (payload.kind === "opened") visibleSet.markOpened(payload.path);
    }
  };

  // v2 (ADR-005, kb/plan.md step 1): session-start staleness pass --
  // comprehension-map.md's third `nodes_invalidated` trigger ("session
  // start"). The repo may have moved while no session was running; every
  // node's citations are checked fresh here, once, before the server
  // accepts its first request -- the SAME mechanism `head_changed` uses
  // mid-session (watch/head-watcher.ts) and step 4's `resume_session`
  // action uses mid-SESSION (api/rupture-guards.ts), just unscoped (every
  // node, not just ones touching a known changed path). One factored
  // helper, three call sites (validate/map-staleness.ts's own header).
  await runMapStalenessPass({ repo, kb, eventStore, modelStore, projectEnvelope }, "revalidate");

  // `close` is declared here (before `buildApp`, which needs an `onEnded`
  // callback that calls it) as a mutable holder assigned just below --
  // `session_end` fires `onEnded` well after this function has returned,
  // so the callback only needs `close` to be assigned BY THEN, not yet.
  let closed = false;
  let closeImpl: () => Promise<void> = () => Promise.resolve();
  const app = buildApp({
    tokens,
    presence,
    eventStore,
    annotationStore,
    readerStateStore,
    modelStore,
    repo,
    kb,
    sessionState,
    clock,
    repoRoot,
    config,
    wsHub,
    noKbMode,
    telemetryCounters,
    projectEnvelope,
    // session_end schedules its own shutdown once the response has had a
    // moment to flush to the client -- see kb/spec/algorithms.md#session-
    // lifecycle: "ended: flush digest, release lock... server exits."
    onEnded: () => setTimeout(() => void closeImpl(), 50),
  });
  // The URL `serve` prints is this same origin -- the browser's entire
  // entry point, so the built web SPA (if present; absent in every
  // server-package test, which never runs `vite build`) is mounted here.
  await mountStaticWeb(app, options.webDistDir ?? path.join(__dirname, "../../backbrief-web/dist"));

  // @hono/node-server's `serve()` return type is a union with the
  // http2/https server types because the SAME function handles all three
  // depending on which options are passed; we never pass http2/tls
  // options, so at runtime this is always a plain `node:http` Server --
  // the cast documents that invariant rather than threading the union
  // through every consumer (attachWsHub, .close()) that only needs plain HTTP.
  const httpServer = (await bindHttpServer(app, options.port)) as NodeHttpServer;
  realWsHub = attachWsHub(httpServer, { tokens, eventStore, repo, kb, presence });

  // Step 3: algorithms.md#head-change-handling. Started only now (HTTP is
  // already bound, the WS hub proxy is already live) so a change detected
  // on the very first tick can be broadcast, not dropped on the floor.
  const headWatcher: HeadWatcherHandle = await startHeadWatcher({
    repo,
    eventStore,
    kb,
    wsHub,
    visibleSet,
    modelStore,
    projectEnvelope,
    ...(options.watchIntervalMs !== undefined ? { intervalMs: options.watchIntervalMs } : {}),
  });

  // Step 3 (kb/plan.md, pedagogy-engine.md#interaction-modes): the TIME-
  // driven half of mode inference -- "any move/node response flips back"
  // is event-driven and lives at the api/events.ts call site instead (see
  // watch/mode-flip.ts's header for the split).
  const modeWatcher: ModeWatcherHandle = startModeWatcher({
    eventStore,
    clock,
    projectEnvelope,
    ...(options.modeWatchIntervalMs !== undefined
      ? { intervalMs: options.modeWatchIntervalMs }
      : {}),
  });

  const address = httpServer.address();
  const port = typeof address === "object" && address ? address.port : (options.port ?? 0);
  const url = `http://${LOOPBACK_ONLY}:${String(port)}/?token=${tokens.humanToken}`;

  await writeLock(repoRoot, { pid: process.pid, startedAt: clock.nowIso() });
  await writeServerJson(repoRoot, {
    pid: process.pid,
    port,
    url,
    token: tokens.agentToken,
    sessionId: session.id,
    startedAt: clock.nowIso(),
  });

  closeImpl = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    headWatcher.stop();
    modeWatcher.stop();
    realWsHub?.closeAllConnections(); // see ws/hub.ts's WsHub#closeAllConnections -- otherwise a connected browser tab hangs the close below forever
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await eventStore.close();
    await annotationStore.close();
    await readerStateStore.close();
    await removeLock(repoRoot);
    await removeServerJson(repoRoot);
  };

  return {
    sessionId: session.id,
    port,
    url,
    agentToken: tokens.agentToken,
    humanToken: tokens.humanToken,
    pid: process.pid,
    close: () => closeImpl(),
  };
}

/**
 * Binds the Hono app to a real HTTP server, translating a fixed-port
 * EADDRINUSE into `E_PORT_IN_USE` (step-1 carry-over, kb/plan.md step 2 --
 * the code existed in the taxonomy but nothing actually threw it).
 * @param requestedPort a specific port, or undefined for a random free one
 *   (NF1: startup speed doesn't need a stable port -- a random port can't
 *   collide, so this codepath only ever fires for a user-supplied `--port`)
 * @throws {AppError} E_PORT_IN_USE if `requestedPort` is already bound
 * @invariant error-taxonomy.md#E_PORT_IN_USE "suggests random-port mode" --
 *   the message says so explicitly
 */
function bindHttpServer(
  app: Hono,
  requestedPort: number | undefined,
): Promise<ReturnType<typeof serveHttp>> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const server = serveHttp(
      { fetch: app.fetch, port: requestedPort ?? 0, hostname: LOOPBACK_ONLY },
      () => {
        if (settled) return;
        settled = true;
        server.removeListener("error", onError);
        resolve(server);
      },
    );
    const onError = (error: NodeJS.ErrnoException): void => {
      if (settled) return;
      settled = true;
      if (error.code === "EADDRINUSE" && requestedPort !== undefined) {
        reject(
          new AppError(
            "E_PORT_IN_USE",
            `port ${String(requestedPort)} is already in use — try random-port mode (omit --port)`,
            {
              port: requestedPort,
            },
          ),
        );
      } else {
        reject(error);
      }
    };
    server.once("error", onError);
  });
}
