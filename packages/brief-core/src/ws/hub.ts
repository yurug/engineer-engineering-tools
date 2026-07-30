// Module: ws/hub -- the browser-only WebSocket channel: replay from
// `?since=` on connect, then live envelope frames with a per-broadcast
// citation-validation sidecar, plus a `validation_update` frame kind pushed
// to every connected client after an out-of-band revalidation pass.
//
// Extracted from @backbrief/server (ADR-001, "ws hub"). Deliberately built
// on raw `ws` in `noServer` mode rather than a Hono WS helper -- Hono's own
// WS adapters target specific runtimes (Bun/Deno/Cloudflare) that don't
// match @hono/node-server's plain Node http.Server, so attaching to the
// underlying server's 'upgrade' event directly is the documented pattern
// for Node.
// Key design decision (a bug found and fixed while backbrief was testing
// this originally): backlog-then-subscribe is not enough to avoid dropping
// a live envelope that arrives while backlog frames are still being sent --
// sending a frame is async (each awaits a fresh validation pass), so a live
// envelope notified mid-send could arrive with no listener attached yet if
// the live-forwarding hookup happened later. `node:events`'s `on()` avoids
// this: it starts BUFFERING emitted events the instant it is called, before
// its consumer (`for await`) ever runs -- so `readSince` + `subscribe` +
// `on(emitter, ...)` all happen synchronously back to back, and the backlog
// send loop runs only after that gap-free setup, with live events queued in
// true append order the whole time.
import type { Server as HttpServer } from "node:http";
import { EventEmitter, on } from "node:events";
import { WebSocketServer, type WebSocket } from "ws";
import type { CitationValidationResult, Envelope } from "@brief/shared";
import type { EventStore } from "../store/event-store";
import type { CitationRepoAccess, CitationKbAccess } from "../content-access";
import { memoizeRevReads } from "../repo-cache";
import type { Tokens } from "../auth";
import type { PresenceSink } from "../api/middleware";
import { validateEnvelopeCitations, type ValidationReport } from "../validate/envelope";

export interface WsHubDeps {
  tokens: Tokens;
  eventStore: Pick<EventStore, "readSince" | "subscribe">;
  repo: CitationRepoAccess;
  kb: CitationKbAccess;
  presence: PresenceSink;
}

interface EnvelopeFrame {
  kind: "envelope";
  envelope: Envelope;
  validation: ValidationReport["results"];
}

/** Pushed after an out-of-band revalidation pass -- the OTHER frame kind this hub emits, outside the per-envelope backlog/live stream. */
interface ValidationUpdateFrame {
  kind: "validation_update";
  updates: CitationValidationResult[];
}

/** What `attachWsHub`'s caller gets back -- lets a HEAD-watcher/explicit-revalidate code path push a frame to every currently-connected browser tab, beyond the per-envelope stream every connection already gets on its own. */
export interface WsHub {
  broadcastValidationUpdate(updates: CitationValidationResult[]): void;
  /**
   * Forcibly ends every open browser connection. Node's `http.Server.close()`
   * only stops accepting NEW connections -- it waits for every EXISTING one
   * (an upgraded WS socket included) to end on its own before invoking its
   * callback, so a still-open browser tab would otherwise hang shutdown
   * forever. A lingering browser connection must never block it.
   */
  closeAllConnections(): void;
}

/** Attaches the WS hub to `httpServer`'s upgrade event, filtered to `/ws`. */
export function attachWsHub(httpServer: HttpServer, deps: WsHubDeps): WsHub {
  const wss = new WebSocketServer({ noServer: true });
  // Every currently-open browser connection -- the set `broadcastValidationUpdate`
  // fans out to. Membership tracked here (not inside `on("upgrade")`'s
  // closure alone) so it survives across many connections over the
  // server's lifetime, added/removed exactly once each in handleConnection.
  const clients = new Set<WebSocket>();
  httpServer.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://internal");
    if (url.pathname !== "/ws") return; // let the HTTP framework's own handling (if any) see it
    // Only the human token is valid here -- WS is the browser's channel.
    if (url.searchParams.get("token") !== deps.tokens.humanToken) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    const since = Number(url.searchParams.get("since") ?? "0");
    wss.handleUpgrade(req, socket, head, (ws) => {
      clients.add(ws);
      ws.on("close", () => clients.delete(ws));
      void handleConnection(ws, Number.isFinite(since) ? since : 0, deps);
    });
  });

  return {
    broadcastValidationUpdate(updates: CitationValidationResult[]): void {
      if (updates.length === 0) return; // nothing changed for anyone visible -- don't wake idle tabs for an empty frame
      const frame: ValidationUpdateFrame = { kind: "validation_update", updates };
      const body = JSON.stringify(frame);
      for (const ws of clients) {
        if (ws.readyState === ws.OPEN) ws.send(body);
      }
    },
    closeAllConnections(): void {
      for (const ws of clients) ws.terminate(); // terminate, not close() -- no graceful-close handshake to wait on either
      clients.clear();
    },
  };
}

async function handleConnection(ws: WebSocket, since: number, deps: WsHubDeps): Promise<void> {
  deps.presence.markSeen("human");
  // One memoizing wrapper for THIS client's whole connection -- the backlog
  // loop below can re-validate the SAME historical envelope's rev-pinned
  // citations across many envelopes (or, on a slow client, the live loop
  // can too); this avoids re-spawning a content read per envelope per
  // client with no reuse. `memoizeRevReads` never caches `"worktree"`
  // reads, so a live envelope citing uncommitted content is always read fresh.
  const connectionRepo = memoizeRevReads(deps.repo);

  // Gap-free setup -- see module header. Nothing between these three
  // calls may `await`.
  const backlog = deps.eventStore.readSince(since);
  const emitter = new EventEmitter();
  const unsubscribeStore = deps.eventStore.subscribe((envelope) => emitter.emit("item", envelope));
  const liveEvents = on(emitter, "item");

  ws.on("message", () => deps.presence.markSeen("human")); // "Client sends nothing but ping"
  ws.on("close", () => {
    unsubscribeStore();
    void liveEvents.return?.();
  });

  // Replay first, strictly in order -- only after this is the live queue
  // (already buffering since the setup above) drained.
  for (const envelope of backlog) {
    await sendEnvelopeFrame(ws, envelope, deps, connectionRepo);
  }
  for await (const [envelope] of liveEvents) {
    if (ws.readyState !== ws.OPEN) break;
    await sendEnvelopeFrame(ws, envelope as Envelope, deps, connectionRepo);
  }
}

/**
 * @invariant the VALIDATION VERDICT is computed fresh at broadcast time,
 *   never reused from a cache -- `repo` may be a `memoizeRevReads` wrapper,
 *   but that only reuses already-resolved, immutable rev-pinned BYTES; the
 *   hash comparison against `citation.contentHash` still runs every single
 *   call, and a `"worktree"` citation's bytes are never cached at all, so a
 *   citation's state can never go stale between broadcasts either way.
 */
async function sendEnvelopeFrame(
  ws: WebSocket,
  envelope: Envelope,
  deps: WsHubDeps,
  repo: CitationRepoAccess,
): Promise<void> {
  if (ws.readyState !== ws.OPEN) return;
  const report = await validateEnvelopeCitations(envelope, repo, deps.kb);
  const frame: EnvelopeFrame = { kind: "envelope", envelope, validation: report.results };
  ws.send(JSON.stringify(frame));
}
