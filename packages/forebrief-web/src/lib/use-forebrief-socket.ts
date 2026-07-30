// Module: lib/use-forebrief-socket -- the browser's live-update channel.
//
// kb/spec/cli-contract.md: "WS /ws?token= (human token only) -- live
// validation/record push to the browser." Reused whole from
// @brief/core's ws/hub.ts (server.ts's `attachWsHub` wiring): on any
// close this reconnects using the highest `seq` seen so far as the new
// `since` (buildWsUrl), so a dropped connection never re-renders a
// duplicate record and never loses one either. Every frame the hub emits
// also carries a `validation` array (backbrief's generic per-envelope
// citation check) -- forebrief's OWN grounding model (ADR-002) computes
// card verdicts server-side, in round files, not per-envelope, so that
// array is dropped here; only `envelope` is kept.
// T2 (kb/properties/edge-cases.md): `everConnected` distinguishes "never
// connected yet" (still booting) from "was live and dropped" -- the
// signal `useServerGone` (lib/server-gone.ts) combines with a failed
// `fetchState` poll to show the reconnect banner, never on a transient
// first-attempt delay alone.
import { useEffect, useRef, useState } from "react";
import type { Envelope } from "./types";
import { buildWsUrl } from "./ws-url";

export interface SocketState {
  connected: boolean;
  everConnected: boolean;
  envelopes: Envelope[];
}

const RECONNECT_DELAY_MS = 1_000;

function isEnvelopeFrame(value: unknown): value is { kind: "envelope"; envelope: Envelope } {
  return (
    typeof value === "object" && value !== null && (value as { kind?: unknown }).kind === "envelope"
  );
}

export function useForebriefSocket(httpOrigin: string, humanToken: string): SocketState {
  const [connected, setConnected] = useState(false);
  const [everConnected, setEverConnected] = useState(false);
  const [envelopes, setEnvelopes] = useState<Envelope[]>([]);
  const sinceRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    function connect(): void {
      if (cancelled) return;
      socket = new WebSocket(buildWsUrl(httpOrigin, humanToken, sinceRef.current));
      socket.addEventListener("open", () => {
        setConnected(true);
        setEverConnected(true);
      });
      socket.addEventListener("message", (messageEvent) => {
        const parsed: unknown = JSON.parse(messageEvent.data as string);
        if (!isEnvelopeFrame(parsed)) return; // a validation_update frame -- not this hook's concern
        sinceRef.current = Math.max(sinceRef.current, parsed.envelope.seq);
        setEnvelopes((prev) => [...prev, parsed.envelope]);
      });
      socket.addEventListener("close", () => {
        setConnected(false);
        if (!cancelled) reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
      });
      socket.addEventListener("error", () => socket?.close());
    }

    connect();
    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [httpOrigin, humanToken]);

  return { connected, everConnected, envelopes };
}
