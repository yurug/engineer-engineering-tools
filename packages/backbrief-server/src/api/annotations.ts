// Module: api/annotations -- GET /api/annotations, the annotation list +
// stale-triage panel's data source.
//
// Added in step 2 -- not in the original api-contracts.md table; documented
// there in the same commit as this file (same-commit rule, CLAUDE.md).
// Relocation status is computed FRESH on every read (never cached) --
// mirrors P1's "computed, never stored as truth" rendering rule for
// citation validation; an annotation that was `reanchored` on last read
// could go `stale` on the next if the repo changed again in between.
import type { Context } from "hono";
import type { AnnotationStore } from "../store/annotation-store";
import type { RepoAccess } from "../repo";
import type { KbAccess } from "../kb-access";
import { relocateAnnotation } from "../validate/relocate";

export interface AnnotationsRouteDeps {
  annotationStore: AnnotationStore;
  repo: RepoAccess;
  kb: KbAccess;
}

export function annotationsRoute(deps: AnnotationsRouteDeps) {
  return async (c: Context): Promise<Response> => {
    const records = deps.annotationStore.list();
    const annotations = await Promise.all(
      records.map((record) => describeAnnotation(record, deps)),
    );
    return c.json({ annotations });
  };
}

async function describeAnnotation(
  record: ReturnType<AnnotationStore["list"]>[number],
  deps: AnnotationsRouteDeps,
) {
  const base = {
    annotationId: record.annotationId,
    text: record.text,
    kind: record.kind,
    archived: record.archived,
    updatedAt: record.updatedAt,
    sessionId: record.sessionId,
  };
  // Archived annotations are dismissed (algorithms.md's triage flow) --
  // relocating a citation nobody wants anchored anymore would be wasted
  // work (a git show / repo-wide scan) for a result no one will see.
  if (record.archived) return { ...base, citation: record.citation, status: "archived" as const };

  const outcome = await relocateAnnotation(record.citation, record.contextHash, deps.repo, deps.kb);
  if (outcome.status === "stale")
    return { ...base, citation: record.citation, status: outcome.status, reason: outcome.reason };
  return {
    ...base,
    citation: outcome.citation,
    status: outcome.status,
    ...(outcome.status === "reanchored" ? { reason: outcome.reason } : {}),
  };
}
