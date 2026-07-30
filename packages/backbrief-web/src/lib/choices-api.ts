// Module: lib/choices-api -- write path for `choice_made` (kb/spec/
// interaction-model.md's choices protocol), the human's response to the
// agent's latest `offer_choices` -- clicking a tactic or submitting the
// free textbox in "Where next".
//
// Mirrors lib/map-api.ts's `postEvent` convention (that module's own header
// explains why POST /api/events is the one durability path, P2, and why
// each write-path module duplicates the small authHeaders/fetch wrapper
// rather than sharing one across lib/api.ts -- this repeats that precedent
// rather than introducing a third shape).
import { ulidGenerator } from "@backbrief/shared/browser";
import type { ApiConfig } from "./api";

function authHeaders(config: ApiConfig): Record<string, string> {
  return { Authorization: `Bearer ${config.humanToken}`, "Content-Type": "application/json" };
}

/**
 * @param choice exactly one of `{choiceId}` (a tactic was clicked) or
 *   `{text}` (the free textbox was submitted) -- interaction-model.md:
 *   "both absent or both present -> E_VALIDATION" (server-enforced,
 *   shared/choices.ts's `checkChoiceMadeShape`). The two-member union here
 *   makes the illegal "both" state unrepresentable from the CALLER side
 *   too, rather than relying on the server rejection alone.
 * @invariant P2 the browser never renders a choice as "sent" until the
 *   server acks it -- callers (Brief.tsx's WhereNext) treat this as
 *   fire-and-forget exactly like postMoveResponse: the UI's own local
 *   state (e.g. the cleared textbox) is optimistic, but "Where next"
 *   itself only stops showing the answered offer once the ack'd
 *   `choice_made` round-trips back through the WS stream
 *   (lib/offer-choices-fold.ts's `findLatestOpenOffer`).
 */
export async function postChoiceMade(
  api: ApiConfig,
  choice: { choiceId: string } | { text: string },
): Promise<{ id: string; seq: number }> {
  const res = await fetch(`${api.httpOrigin}/api/events`, {
    method: "POST",
    headers: authHeaders(api),
    body: JSON.stringify({
      type: "choice_made",
      clientKey: ulidGenerator.next(),
      payload: choice,
    }),
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
