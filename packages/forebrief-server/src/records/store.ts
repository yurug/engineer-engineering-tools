// Module: records/store -- appends one parsed record submission to the
// decision log as a core Envelope (kb/spec/data-model.md).
//
// @invariant every record payload is stamped with `sessionId` (the running
//   server's own session id, from ServerInfo) -- @brief/core's Envelope
//   has no sessionId field of its own (it is per-SESSION-file there; ours
//   is per-REPO), so this is where forebrief recovers that identity
//   (T2/ADR-004's `late` marking depends on it). Documented as KB drift
//   fixed in kb/spec/data-model.md (same commit).
// @invariant P5: `reconciliation.late` is computed here, server-side, from
//   the ORIGINAL decision's stamped sessionId -- never accepted as input
//   (records/schemas.ts's ReconciliationInputSchema has no `late` field).
import type { EventStore, AppendResult, CitationRepoAccess } from "@brief/core";
import { makeCitationMinter } from "@brief/core";
import type { Actor, Citation, CitationInput } from "@brief/shared";
import type { RecordSubmission } from "./schemas";
import { findDecisionForCard, payloadOf } from "./queries";

export interface AppendRecordDeps {
  eventStore: EventStore;
  sessionId: string;
  repo: CitationRepoAccess;
}

async function mintIfCode(input: CitationInput, repo: CitationRepoAccess): Promise<Citation> {
  return input.kind === "code" ? makeCitationMinter(repo)(input) : input;
}

/** @invariant T2/ADR-004: `late` is true iff the card's ORIGINAL decision was stamped by a different session than this reconciliation. */
function computeLate(eventStore: EventStore, cardId: string, currentSessionId: string): boolean {
  const decision = findDecisionForCard(eventStore.readSince(0), cardId);
  if (!decision) return false; // no prior decision on record -- nothing to be "late" relative to
  const decisionSessionId = payloadOf(decision)["sessionId"];
  return decisionSessionId !== currentSessionId;
}

/**
 * @param submission a zod-parsed RecordSubmission (records/schemas.ts already
 *   enforced P8's applied_state requirement)
 * @invariant P6 durable-before-ack: resolves only after EventStore.append's
 *   fsync completes (core's own guarantee, reused whole)
 */
export async function appendRecord(
  submission: RecordSubmission,
  actor: Actor,
  deps: AppendRecordDeps,
): Promise<AppendResult> {
  const { kind, ...rest } = submission;
  const payload: Record<string, unknown> = { ...rest, sessionId: deps.sessionId };
  let refs: Citation[] = [];

  if (kind === "reconciliation") {
    payload["late"] = computeLate(deps.eventStore, submission.card, deps.sessionId);
  }
  if (kind === "answer" && submission.citations) {
    const minted = await Promise.all(submission.citations.map((c) => mintIfCode(c, deps.repo)));
    payload["citations"] = minted;
    refs = minted;
  }

  return deps.eventStore.append({ actor, type: kind, refs, payload });
}
