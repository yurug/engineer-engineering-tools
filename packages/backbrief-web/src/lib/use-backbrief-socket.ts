// Module: lib/use-backbrief-socket -- the browser's one connection to the
// backbrief server.
//
// Implements api-contracts.md#websocket-browser-only (connect with
// token+since, receive `{kind:"envelope", envelope, validation}` frames)
// and T6/P8b ("Browser closed / laptop suspend... same URL resumes the
// session. WS reconnect replays from the client's last seen seq"): on any
// close, this reconnects using the highest `seq` seen so far as the new
// `since`, so a dropped connection never re-renders duplicate cards and
// never loses one either (the server-side replay is itself gap-free -- see
// server/src/ws/hub.ts's header for why). A periodic "ping" message keeps
// `humanSeen` fresh while the tab is open and idle (api-contracts.md:
// "Client sends nothing but ping").
// Step 3: the OTHER frame kind this channel carries, `validation_update`
// (pushed after HEAD-watcher revalidation or POST /api/revalidate,
// algorithms.md#head-change-handling), is now APPLIED live -- see
// `applyValidationUpdate` below -- instead of being silently ignored. It
// never adds a new frame to the feed (it isn't an envelope); it refreshes
// the `validation` entries of whatever EXISTING frames cite the same path.
import { useEffect, useRef, useState } from "react";
import type { Citation, Envelope, ValidationState } from "@backbrief/shared/browser";
import { buildWsUrl } from "./ws-url";

export interface ValidationEntry {
  citation: Citation;
  state: ValidationState;
  reason?: string;
}

export interface EnvelopeFrame {
  kind: "envelope";
  envelope: Envelope;
  validation: ValidationEntry[];
}

interface ValidationUpdateFrame {
  kind: "validation_update";
  updates: ValidationEntry[];
}

interface SocketState {
  connected: boolean;
  frames: EnvelopeFrame[];
}

const RECONNECT_DELAY_MS = 1_000;
const PING_INTERVAL_MS = 20_000;

function isEnvelopeFrame(value: unknown): value is EnvelopeFrame {
  return (
    typeof value === "object" && value !== null && (value as { kind?: unknown }).kind === "envelope"
  );
}

function isValidationUpdateFrame(value: unknown): value is ValidationUpdateFrame {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { kind?: unknown }).kind === "validation_update"
  );
}

/**
 * A citation has no stable id of its own (data-model.md), so "the same
 * citation, possibly with a fresher state" is matched by `(kind, path)` --
 * deliberately NOT also `startLine`/`endLine`, because drift repair
 * (algorithms.md) changes exactly those fields on the SAME logical
 * citation, which is the most common reason an update exists at all.
 * Trade-off, documented rather than silent: a card citing the SAME file at
 * two DIFFERENT, unrelated line ranges could have one range's fresh state
 * applied to the other's badge until the next full reconnect/replay
 * self-corrects it -- a rare cosmetic staleness, never a grounding
 * violation (P1's actual enforcement is server-side, at render/action time,
 * not this badge).
 */
function sameCitationTarget(a: Citation, b: Citation): boolean {
  return a.kind === b.kind && a.path === b.path;
}

/** @invariant P1-adjacent UI freshness: refreshes matching entries' state/reason in place; never drops or reorders `frames`. */
function applyValidationUpdate(
  frames: EnvelopeFrame[],
  update: ValidationUpdateFrame,
): EnvelopeFrame[] {
  if (update.updates.length === 0) return frames;
  return frames.map((frame) => ({
    ...frame,
    validation: frame.validation.map((entry) => {
      const fresh = update.updates.find((u) => sameCitationTarget(u.citation, entry.citation));
      return fresh ?? entry;
    }),
  }));
}

export function useBackbriefSocket(httpOrigin: string, humanToken: string): SocketState {
  const [connected, setConnected] = useState(false);
  const [frames, setFrames] = useState<EnvelopeFrame[]>([]);
  const sinceRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    let pingTimer: number | undefined;

    function connect(): void {
      if (cancelled) return;
      socket = new WebSocket(buildWsUrl(httpOrigin, humanToken, sinceRef.current));
      socket.addEventListener("open", () => {
        setConnected(true);
        pingTimer = window.setInterval(() => socket?.send("ping"), PING_INTERVAL_MS);
      });
      socket.addEventListener("message", (messageEvent) => {
        const parsed: unknown = JSON.parse(messageEvent.data as string);
        if (isEnvelopeFrame(parsed)) {
          sinceRef.current = Math.max(sinceRef.current, parsed.envelope.seq);
          setFrames((prev) => [...prev, parsed]);
        } else if (isValidationUpdateFrame(parsed)) {
          setFrames((prev) => applyValidationUpdate(prev, parsed));
        }
      });
      socket.addEventListener("close", () => {
        setConnected(false);
        if (pingTimer) window.clearInterval(pingTimer);
        if (!cancelled) reconnectTimer = window.setTimeout(connect, RECONNECT_DELAY_MS);
      });
      socket.addEventListener("error", () => socket?.close());
    }

    connect();
    return () => {
      cancelled = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (pingTimer) window.clearInterval(pingTimer);
      socket?.close();
    };
  }, [httpOrigin, humanToken]);

  return { connected, frames };
}
