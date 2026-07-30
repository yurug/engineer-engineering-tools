// Module: lib/map-api -- write paths for the v2 move loop (ADR-005):
// `move_response` and `node_response`, both human events posted through
// POST /api/events (the uniform durability path, P2), same convention as
// lib/api.ts's `postAnnotation`.
//
// Reading the map itself needs NO fetch: nodes/overlay/frontier are pure
// folds over the SAME live envelope stream the WS socket already delivers
// (shared/browser's foldMap/foldOverlay/computeFrontier) -- see
// components/ComprehensionPanel.tsx, which is the only caller of those.
// This module is write-only, mirroring the read/write split lib/api.ts
// already draws for annotations.
import { ulidGenerator, type EvidenceKind, type MasteryState } from "@backbrief/shared/browser";
import type { ApiConfig } from "./api";

function authHeaders(config: ApiConfig): Record<string, string> {
  return { Authorization: `Bearer ${config.humanToken}`, "Content-Type": "application/json" };
}

async function postEvent(config: ApiConfig, body: unknown): Promise<{ id: string; seq: number }> {
  const res = await fetch(`${config.httpOrigin}/api/events`, {
    method: "POST",
    headers: authHeaders(config),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const parsed: unknown = await res.json().catch(() => null);
    const message =
      typeof parsed === "object" && parsed && "error" in parsed
        ? String((parsed as { error: { message?: unknown } }).error.message)
        : `HTTP ${String(res.status)}`;
    throw new Error(message);
  }
  return (await res.json()) as { id: string; seq: number };
}

/**
 * @param moveId the present_move action's own envelope id (pedagogy-engine.md)
 * @invariant P11 the human-authored kinds here (answer/got-it/not-clear/
 *   thats-wrong/show-evidence) are the only ones that can ever advance
 *   mastery -- the server enforces the human token regardless of kind.
 *   "step"/"stall" are SYSTEM-GENERATED telemetry (pedagogy-engine.md: "the
 *   device stepper telemetry"), posted by lib/use-device-stepper.ts's
 *   callbacks rather than a person clicking a quick-response button --
 *   still routed through this same human-token function because
 *   move_response is a human-actor event either way (P2: durable before ack).
 */
export function postMoveResponse(
  api: ApiConfig,
  moveId: string,
  kind: "answer" | "got-it" | "not-clear" | "thats-wrong" | "show-evidence" | "step" | "stall",
  text?: string,
): Promise<{ id: string; seq: number }> {
  return postEvent(api, {
    type: "move_response",
    clientKey: ulidGenerator.next(),
    payload: { moveId, kind, ...(text !== undefined ? { text } : {}) },
  });
}

/** confirm/refine/contest/override -- comprehension-map.md#protocol-additions. */
export function postNodeResponse(
  api: ApiConfig,
  input: {
    nodeId: string;
    response: "confirm" | "refine" | "contest" | "override";
    refinedAnswer?: string;
    overrideState?: MasteryState;
    reason?: string;
    evidenceKind?: EvidenceKind;
  },
): Promise<{ id: string; seq: number }> {
  const { nodeId, response, ...rest } = input;
  return postEvent(api, {
    type: "node_response",
    clientKey: ulidGenerator.next(),
    payload: { nodeId, response, ...rest },
  });
}

/**
 * v2 step 4 (pedagogy-engine.md#rupture): the human's answer to a
 * `propose_change_break` action -- `ChangeBreakProposal.tsx`'s Accept/Later
 * buttons are the only caller. Human-only, like `move_response`/
 * `node_response` above (server/api/events.ts gates it the same way).
 */
export function postChangeBreakResponse(
  api: ApiConfig,
  accepted: boolean,
): Promise<{ id: string; seq: number }> {
  return postEvent(api, {
    type: "change_break_response",
    clientKey: ulidGenerator.next(),
    payload: { accepted },
  });
}
