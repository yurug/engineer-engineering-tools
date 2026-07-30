// Module: lib/use-presence -- polls GET /api/session for the presence chip.
//
// P5 ("Honest presence"): the UI must show the agent's REAL availability,
// never simulate it. Presence isn't pushed over WS (api-contracts.md's WS
// frame kinds are only envelope/validation_update), so this polls --
// api-contracts.md: "Away = older than 60s", which the chip itself derives
// from the timestamp on every render (see ../components/PresenceChip.tsx),
// not from this hook -- polling only needs to be frequent enough that a
// 60s-old timestamp is noticed promptly.
import { useEffect, useState } from "react";
import { fetchPresence, type ApiConfig, type PresenceSnapshot } from "./api";

const POLL_INTERVAL_MS = 10_000;

export function usePresence(config: ApiConfig): PresenceSnapshot {
  const [presence, setPresence] = useState<PresenceSnapshot>({ agentSeen: null, humanSeen: null });

  useEffect(() => {
    let cancelled = false;
    async function poll(): Promise<void> {
      const snapshot = await fetchPresence(config).catch(() => ({
        agentSeen: null,
        humanSeen: null,
      }));
      if (!cancelled) setPresence(snapshot);
    }
    void poll();
    const timer = window.setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [config.httpOrigin, config.humanToken]);

  return presence;
}
