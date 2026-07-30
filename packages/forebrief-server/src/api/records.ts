// Module: api/records -- POST /api/records, `forebrief act`'s HTTP target.
//
// kb/spec/cli-contract.md: "Append one record (decision from chat/file,
// reconciliation, ask-context answer, fold-result)." Output: "the appended
// record with its seq."
import type { Context } from "hono";
import { AppError } from "@brief/shared";
import type { EventStore, CitationRepoAccess } from "@brief/core";
import { RecordSubmissionSchema, FORBIDDEN_ENVELOPE_KEYS } from "../records/schemas";
import { appendRecord } from "../records/store";
import { schemaErrorMessage } from "../schema-error";

export interface RecordsRouteDeps {
  eventStore: EventStore;
  repo: CitationRepoAccess;
  sessionId: string;
}

/** @throws {AppError} E_SEQ_CONFLICT if the body names an envelope-owned field (P5: "the log is append-only"). */
function assertNoMutationAttempt(body: unknown): void {
  if (!body || typeof body !== "object") return;
  const keys = Object.keys(body);
  const offending = FORBIDDEN_ENVELOPE_KEYS.find((key) => keys.includes(key));
  if (offending) {
    throw new AppError(
      "E_SEQ_CONFLICT",
      `the decision log is append-only -- "${offending}" is server-assigned and cannot be submitted`,
      { field: offending },
    );
  }
}

export function recordsRoute(deps: RecordsRouteDeps) {
  return async (c: Context): Promise<Response> => {
    const body: unknown = await c.req.json();
    assertNoMutationAttempt(body);
    const parsed = RecordSubmissionSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("E_SCHEMA", schemaErrorMessage("malformed record", parsed.error.issues), {
        issues: parsed.error.issues,
      });
    }
    const actor = c.get("actor");
    const result = await appendRecord(parsed.data, actor, {
      eventStore: deps.eventStore,
      sessionId: deps.sessionId,
      repo: deps.repo,
    });
    return c.json({ id: result.id, seq: result.seq });
  };
}
