// Module: lib/talk-api -- write paths for the talk lifecycle's HUMAN events
// (kb/spec/interaction-model.md's "Protocol -- talk" section):
// `talk_advance` ("continue"), `talk_exit` ("leave the talk"), and the
// slide-scoped `question` ("ask about this step").
//
// Mirrors lib/choices-api.ts's own precedent exactly (same authHeaders/
// postEvent shape, same P2 "fire and forget, the STREAM is what confirms it
// landed" contract) rather than routing through lib/browse-api.ts's generic
// `postHumanEvent` -- a dedicated module per protocol keeps each one
// independently testable and gives `postTalkQuestion` a typed signature
// (`text`) instead of the generic `payload: object` every OTHER event type
// shares there.
import { ulidGenerator } from "@backbrief/shared/browser";
import type { ApiConfig } from "./api";

function authHeaders(config: ApiConfig): Record<string, string> {
  return { Authorization: `Bearer ${config.humanToken}`, "Content-Type": "application/json" };
}

async function postEvent(
  api: ApiConfig,
  type: string,
  payload: object,
): Promise<{ id: string; seq: number }> {
  const res = await fetch(`${api.httpOrigin}/api/events`, {
    method: "POST",
    headers: authHeaders(api),
    body: JSON.stringify({ type, clientKey: ulidGenerator.next(), payload }),
  });
  if (!res.ok) {
    const parsed: unknown = await res.json().catch(() => null);
    const message =
      typeof parsed === "object" && parsed && "error" in parsed
        ? String((parsed as { error: { message?: unknown } }).error.message)
        : `HTTP ${String(res.status)}`;
    throw new Error(`${type} was not saved: ${message}`);
  }
  return (await res.json()) as { id: string; seq: number };
}

/** "Continue" -- UI-paced (like `tour_ack`), asks the agent for the next slide. */
export function postTalkAdvance(api: ApiConfig): Promise<{ id: string; seq: number }> {
  return postEvent(api, "talk_advance", {});
}

/** "Leave the talk" early -- the agent then `offer_choices` again (interaction-model.md). */
export function postTalkExit(api: ApiConfig): Promise<{ id: string; seq: number }> {
  return postEvent(api, "talk_exit", {});
}

/**
 * "Or ask about this step" -- interaction-model.md: "Asking on a slide
 * reuses `question { text, ... }` -- it pauses advancement." No `citation`
 * is attached: a talk slide's own device (if any) is already grounded and
 * shown inline (DeviceCard, via `frame.validation`), so the question text
 * alone is enough context for the agent to answer against the slide it was
 * asked on (lib/talk-fold.ts's `isTalkPaused` scopes pause detection to
 * "since this slide's own seq", not to a specific citation).
 */
export function postTalkQuestion(
  api: ApiConfig,
  text: string,
): Promise<{ id: string; seq: number }> {
  return postEvent(api, "question", { text });
}
