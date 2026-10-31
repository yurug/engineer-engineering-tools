// Module: server -- the composition root: wires fsguard/discovery/event-
// store/auth/app into one running forebrief server instance.
//
// Mirrors @backbrief/server's own `startServer` DI seam (ADR-001,
// kb/architecture/overview.md: "composition root... mirrors core's DI
// seam"): recover stale artifacts (T6) -> bootstrap `.forebrief/` -> open
// the per-repo decision log -> bind HTTP -> write discovery files -> return
// a handle. One plain async function returning a `close()`-able handle, so
// both `bin/daemon-entry.ts` (real usage) and integration tests (in-process)
// can call it identically.
import * as path from "node:path";
import type { Server as NodeHttpServer } from "node:http";
import type { Hono } from "hono";
import { serve as serveHttp } from "@hono/node-server";
import { systemClock, ulidGenerator, AppError, type Clock, type IdGenerator } from "@brief/shared";
import {
  resolveRepoRoot,
  generateTokens,
  EventStore,
  recoverStaleArtifactsOrThrow,
  writeLock,
  writeServerJson,
  removeLock,
  removeServerJson,
  mountStaticWeb,
  attachWsHub,
  type ServerInfo,
  type WsHub,
} from "@brief/core";
import { resolveForebriefPath } from "./fsguard";
import { ensureForebriefGitignore } from "./bootstrap";
import { readLastPort, writeLastPort } from "./last-port";
import { loadConfig } from "./config";
import { buildApp, NO_OP_PRESENCE } from "./app";
import { makeForebriefRepoAccess, makeForebriefKbAccess } from "./repo-access";

/** forebrief's own choice of core's required stateDirName parameter (P3). */
const STATE_DIR = ".forebrief";
/** @invariant P3/P7-adjacent: always binds loopback only, never a public interface. */
const LOOPBACK_ONLY = "127.0.0.1";
const DECISIONS_LOG_RELATIVE_PATH = "decisions.jsonl";

export interface StartServerOptions {
  repoRoot: string;
  title?: string;
  /** Explicit --port: bypasses ADR-006's rebinding entirely (a collision is
   *  always E_PORT_IN_USE, never a silent fallback). Omit to let ADR-006
   *  choose: the repo's last-used port (`.forebrief/last-port`) if one is on
   *  record and free, else a random free port (NF2: startup speed doesn't
   *  need a stable port on the very first serve). */
  port?: number;
  /** Test seam: override the clock/id-generator (DI, code-style.md). */
  deps?: { clock?: Clock; ids?: IdGenerator };
  /** Absolute path to the built web SPA's output (@forebrief/web's `vite
   *  build` result) -- ALWAYS inject this explicitly at the real call site
   *  (bin/daemon-entry.ts); this default (computed relative to THIS
   *  package's own compiled location, mirroring @backbrief/server's own
   *  `startServer` seam) exists only so a consumer that has no opinion
   *  still gets a working monorepo-relative path, never a hardcoded
   *  environment one (DI, code-style.md). Every server-package test omits
   *  this -- none of them run `vite build`, so `mountStaticWeb` finds no
   *  `index.html` and mounts no static routes at all (its own documented
   *  no-throw degrade). */
  webDistDir?: string;
}

export interface ServerHandle {
  sessionId: string;
  port: number;
  url: string;
  /** Agent-token bearer credential -- the human token lives only in `url`. */
  agentToken: string;
  humanToken: string;
  pid: number;
  close(): Promise<void>;
}

/**
 * @throws {AppError} E_NO_REPO if `repoRoot` is not inside a git repository
 * @throws {AppError} E_ALREADY_RUNNING if a live server already holds this repo (T6)
 * @throws {AppError} E_CONFIG if `.forebrief/config.json` is invalid
 * @invariant P3 every write this function makes goes through
 *   `resolveForebriefPath`/core's own state-dir-confined primitives
 * @invariant T6 stale lock/server.json artifacts are cleaned before a new
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
  await ensureForebriefGitignore(repoRoot);
  await loadConfig(repoRoot); // validates config.json now (E_CONFIG fails startup loudly); step 1 doesn't consult any field yet
  await recoverStaleArtifactsOrThrow(repoRoot, STATE_DIR);

  const sessionId = ids.next();
  const decisionsLogPath = resolveForebriefPath(repoRoot, DECISIONS_LOG_RELATIVE_PATH);
  const eventStore = await EventStore.open(decisionsLogPath, { clock, ids });
  const tokens = generateTokens();

  const repo = makeForebriefRepoAccess(repoRoot);
  const kb = makeForebriefKbAccess(repoRoot);

  let closed = false;
  let closeImpl: () => Promise<void> = () => Promise.resolve();
  const app = buildApp({
    tokens,
    repoRoot,
    eventStore,
    repo,
    kb,
    clock,
    ids,
    sessionId,
    // /api/stop schedules its own shutdown once the response has had a
    // moment to flush to the client (mirrors brief-core's session-lifecycle pattern).
    onStop: () => setTimeout(() => void closeImpl(), 50),
  });
  // The URL `serve` prints is this same origin -- the browser's entire
  // entry point, so the built web SPA (if present; absent in every
  // server-package test, which never runs `vite build`) is mounted here,
  // same pattern as @backbrief/server's own `startServer` (mirrors ADR-001).
  await mountStaticWeb(app, options.webDistDir ?? path.join(__dirname, "../../forebrief-web/dist"));

  // ADR-006: no explicit --port -> try the repo's last-used one first (a
  // collision there falls back to ephemeral with a warning, never a hard
  // error); an explicit --port bypasses this entirely.
  const preferredPort =
    options.port === undefined ? ((await readLastPort(repoRoot)) ?? undefined) : undefined;
  const httpServer = (await bindHttpServer(app, {
    explicitPort: options.port,
    preferredPort,
  })) as NodeHttpServer;
  // WS /ws?token= (human token only, core's own check) -- the browser's live
  // update channel (kb/spec/cli-contract.md's HTTP surface). Attached only
  // now, once HTTP is bound: attachWsHub listens on the real http.Server's
  // 'upgrade' event.
  const wsHub: WsHub = attachWsHub(httpServer, {
    tokens,
    eventStore,
    repo,
    kb,
    presence: NO_OP_PRESENCE,
  });

  const address = httpServer.address();
  const port = typeof address === "object" && address ? address.port : (options.port ?? 0);
  const url = `http://${LOOPBACK_ONLY}:${String(port)}/?token=${tokens.humanToken}`;

  // ADR-006: whatever port we actually ended up on (explicit, rebound, or a
  // fresh ephemeral one) becomes the NEXT --port-less serve's preference.
  await writeLastPort(repoRoot, port);
  await writeLock(repoRoot, STATE_DIR, { pid: process.pid, startedAt: clock.nowIso() });
  const info: ServerInfo = {
    pid: process.pid,
    port,
    url,
    token: tokens.agentToken,
    sessionId,
    startedAt: clock.nowIso(),
  };
  await writeServerJson(repoRoot, STATE_DIR, info);

  closeImpl = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    wsHub.closeAllConnections(); // otherwise a connected browser tab's still-open WS hangs the close below forever
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await eventStore.close();
    await removeLock(repoRoot, STATE_DIR);
    await removeServerJson(repoRoot, STATE_DIR);
  };

  return {
    sessionId,
    port,
    url,
    agentToken: tokens.agentToken,
    humanToken: tokens.humanToken,
    pid: process.pid,
    close: () => closeImpl(),
  };
}

interface BindPortOptions {
  /** Explicit --port; a collision is always E_PORT_IN_USE (unchanged semantics). */
  explicitPort?: number | undefined;
  /** ADR-006: the repo's last-used port, tried only when there is no
   *  `explicitPort` -- a collision here falls back to a fresh ephemeral
   *  port with a single stderr warning, never a hard error (the CLI passed
   *  no --port, so nothing the user asked for is being overridden). */
  preferredPort?: number | undefined;
}

/**
 * Binds the Hono app to a real HTTP server.
 * @throws {AppError} E_PORT_IN_USE if `explicitPort` was given and is
 *   already bound by another process (kb/spec/error-taxonomy.md) -- a
 *   `preferredPort` collision, or no port preference at all, never throws
 *   this way (ADR-006: the ephemeral fallback always succeeds instead)
 */
function bindHttpServer(app: Hono, opts: BindPortOptions): Promise<ReturnType<typeof serveHttp>> {
  const requestedPort = opts.explicitPort ?? opts.preferredPort;
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
    const onError = (error: Error): void => {
      if (settled) return;
      const isAddrInUse = "code" in error && (error as NodeJS.ErrnoException).code === "EADDRINUSE";
      if (isAddrInUse && opts.explicitPort !== undefined) {
        settled = true;
        reject(
          new AppError(
            "E_PORT_IN_USE",
            `port ${String(opts.explicitPort)} is already in use -- pick another port or omit --port for auto-assignment`,
            { port: opts.explicitPort },
          ),
        );
        return;
      }
      if (isAddrInUse && opts.preferredPort !== undefined) {
        settled = true;
        // ADR-006: the recovered session cannot keep the same origin this
        // time -- shrinks to the residual collision case the ADR accepted,
        // never a startup failure.
        console.error(
          `[forebrief] port ${String(opts.preferredPort)} (last used) is already in use -- falling back to an ephemeral port (ADR-006)`,
        );
        resolve(bindHttpServer(app, {}));
        return;
      }
      settled = true;
      reject(error);
    };
    server.once("error", onError);
  });
}
