// Module: presence -- the agentSeen/humanSeen ledger behind P5 (honest presence).
//
// api-contracts.md: "agentSeen = timestamp of the last agent-token request,
// where an OPEN events/follow stream counts via a 30s server-side
// heartbeat... humanSeen = timestamp of the last WS ping or human-actor
// event. Away = older than 60s." This module is just the ledger (two
// timestamps); the "who calls markSeen and when" policy (every
// authenticated request, plus the follow endpoint's periodic heartbeat, plus
// WS ping/message) lives in api/middleware.ts and ws/hub.ts.
import type { Clock } from "@backbrief/shared";
import type { TokenActor } from "./auth";

export interface PresenceSnapshot {
  agentSeen: string | null;
  humanSeen: string | null;
}

export class Presence {
  private agentSeenAt: string | null = null;
  private humanSeenAt: string | null = null;

  constructor(private readonly clock: Clock) {}

  /** @invariant P5 the only two writes to presence state in the whole server. */
  markSeen(actor: TokenActor): void {
    const now = this.clock.nowIso();
    if (actor === "agent") this.agentSeenAt = now;
    else this.humanSeenAt = now;
  }

  snapshot(): PresenceSnapshot {
    return { agentSeen: this.agentSeenAt, humanSeen: this.humanSeenAt };
  }
}
