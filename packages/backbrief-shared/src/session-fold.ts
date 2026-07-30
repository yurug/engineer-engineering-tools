// Module: session-fold -- pure folds from an envelope stream to the "open"
// questions/findings/KB-proposals the state digest lists.
//
// Implements kb/spec/algorithms.md#state-digest-generation's non-coverage
// half: "open questions, findings and KB proposals with status == 'open'".
// Each record type follows the same pattern data-model.md describes for
// Envelope ids: the OPENING event's server-assigned `id` becomes the key a
// later closing event references (`answer.questionId`,
// `resolve_finding.findingId`, `resolve_proposal.proposalId`) -- so folding
// is "index openers by id, then apply closers", no separate id generation
// needed here. Pure (no I/O) per architecture/overview.md's shared-package
// rule; the server supplies the (already cross-session-flattened) envelope
// list.
import type { Envelope } from "@brief/shared";
import type { Citation } from "@brief/shared";

export interface OpenQuestion {
  questionId: string;
  text: string;
  citation?: Citation;
  askedBy: Envelope["actor"];
}

export interface FindingRecord {
  findingId: string;
  title: string;
  body: string;
  citations: Citation[];
  status: "open" | "resolved";
  resolution?: string;
}

export interface ProposalRecord {
  proposalId: string;
  kbPath: string;
  suggestion: string;
  status: "open" | "resolved";
  outcome?: "applied" | "rejected";
}

interface QuestionPayload {
  text: string;
  citation?: Citation;
}
interface AskQuestionPayload {
  text: string;
  kbAnchor: Citation;
}
interface AnswerPayload {
  questionId: string;
}
interface OpenFindingPayload {
  title: string;
  body: string;
  citations: Citation[];
}
interface ResolveFindingPayload {
  findingId: string;
  resolution: string;
}
interface KbProposalPayload {
  kbPath: string;
  suggestion: string;
}
interface ResolveProposalPayload {
  proposalId: string;
  outcome: "applied" | "rejected";
}

/**
 * @returns every open question -- either a free-floating `question` EVENT
 *   or an anchored `ask_question` ACTION (P9's challenge question) -- not
 *   yet referenced by a later `answer`. data-model.md's "open until an
 *   answer references it" rule doesn't distinguish the two sources: both
 *   are, structurally, "something asked that wants an answer", and
 *   `answer.questionId` is defined against "the questionId" generically,
 *   not against one source's id space specifically. Folding both into ONE
 *   map (keyed by the asking envelope's own server-assigned id, the same
 *   pattern `foldFindings`/`foldProposals` use) is what makes US8's
 *   challenge question answerable through the SAME QuestionPanel UI a
 *   free-floating question uses, with no separate "challenge inbox" to build.
 * @invariant P9 an `ask_question`'s `kbAnchor` is surfaced as this
 *   question's `citation` -- the anchor is never lost between action and
 *   the human-facing answer prompt
 */
export function foldOpenQuestions(envelopes: readonly Envelope[]): OpenQuestion[] {
  const open = new Map<string, OpenQuestion>();
  for (const envelope of envelopes) {
    if (envelope.type === "question") {
      const payload = envelope.payload as unknown as QuestionPayload;
      open.set(envelope.id, {
        questionId: envelope.id,
        text: payload.text,
        ...(payload.citation ? { citation: payload.citation } : {}),
        askedBy: envelope.actor,
      });
    } else if (envelope.type === "ask_question") {
      const payload = envelope.payload as unknown as AskQuestionPayload;
      open.set(envelope.id, {
        questionId: envelope.id,
        text: payload.text,
        citation: payload.kbAnchor,
        askedBy: envelope.actor,
      });
    } else if (envelope.type === "answer") {
      open.delete((envelope.payload as unknown as AnswerPayload).questionId);
    }
  }
  return [...open.values()];
}

/** @returns every finding, `open` unless a later `resolve_finding` closed it. */
export function foldFindings(envelopes: readonly Envelope[]): FindingRecord[] {
  const findings = new Map<string, FindingRecord>();
  for (const envelope of envelopes) {
    if (envelope.type === "open_finding") {
      const payload = envelope.payload as unknown as OpenFindingPayload;
      findings.set(envelope.id, {
        findingId: envelope.id,
        title: payload.title,
        body: payload.body,
        citations: payload.citations,
        status: "open",
      });
    } else if (envelope.type === "resolve_finding") {
      const payload = envelope.payload as unknown as ResolveFindingPayload;
      const prior = findings.get(payload.findingId);
      if (prior)
        findings.set(payload.findingId, {
          ...prior,
          status: "resolved",
          resolution: payload.resolution,
        });
    }
  }
  return [...findings.values()];
}

/** @returns every KB-refinement proposal, `open` unless a later `resolve_proposal` closed it. */
export function foldProposals(envelopes: readonly Envelope[]): ProposalRecord[] {
  const proposals = new Map<string, ProposalRecord>();
  for (const envelope of envelopes) {
    if (envelope.type === "kb_proposal") {
      const payload = envelope.payload as unknown as KbProposalPayload;
      proposals.set(envelope.id, {
        proposalId: envelope.id,
        kbPath: payload.kbPath,
        suggestion: payload.suggestion,
        status: "open",
      });
    } else if (envelope.type === "resolve_proposal") {
      const payload = envelope.payload as unknown as ResolveProposalPayload;
      const prior = proposals.get(payload.proposalId);
      if (prior)
        proposals.set(payload.proposalId, {
          ...prior,
          status: "resolved",
          outcome: payload.outcome,
        });
    }
  }
  return [...proposals.values()];
}
