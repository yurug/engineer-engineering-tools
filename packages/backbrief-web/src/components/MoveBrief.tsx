// Component: MoveBrief -- "This brief" content for a present_move: the
// node's question as headline (Rule 0b: "the frame is not re-sent" -- the
// question lives on the MAP node, not the move) and the move's own
// `intent` sentence, with the device/say/ask/answer/quick-responses as the
// brief's body. Replaces SessionMove.tsx (kb/plan.md R7-2: "delete/retire
// any Session component the brief replaces") -- the quick-response buttons
// (got-it/not-clear/thats-wrong/show-evidence) still apply WITHIN the move,
// per that step's scope; only the outer frame (question heading, card
// border) moves to Brief.tsx, mounted generically for every content kind.
import { useState } from "react";
import { Brief, type BriefNext } from "./Brief";
import { citationLocationLabel } from "../lib/citation-view";
import { citationNavTarget, type CodeNavTarget } from "../lib/code-nav";
import { CitationStrip } from "./CitationStrip";
import { DeviceCard } from "./DeviceCard";
import { GlossaryText } from "./GlossaryText";
import { AwaitingAgentStatus } from "./AwaitingAgentStatus";
import { postMoveResponse } from "../lib/map-api";
import { useAwaitingAgent } from "../lib/awaiting-agent";
import type { ApiConfig } from "../lib/api";
import type { DeviceSpec, Envelope, GlossaryTerm, MapNode } from "@backbrief/shared/browser";
import type { EnvelopeFrame } from "../lib/use-backbrief-socket";

interface PresentMovePayload {
  nodeId: string;
  device?: DeviceSpec;
  intent?: string;
  say: string;
  ask: { text: string; kind: string };
}

const QUICK_RESPONSES = [
  { kind: "got-it" as const, label: "Got it" },
  { kind: "not-clear" as const, label: "Not clear" },
  { kind: "thats-wrong" as const, label: "That's wrong" },
  { kind: "show-evidence" as const, label: "Show evidence" },
];

const NO_TERMS: readonly GlossaryTerm[] = [];
const NO_ENVELOPES: readonly Envelope[] = [];

export function MoveBrief({
  api,
  established,
  runningHead,
  frame,
  node,
  envelopes = NO_ENVELOPES,
  agentSeen = null,
  next,
  terms = NO_TERMS,
  onOpenCitation,
}: {
  api: ApiConfig;
  established: readonly string[];
  runningHead?: string;
  frame: EnvelopeFrame;
  node: MapNode | undefined;
  /** 2026-07-19 (P5's honest-pending indicator): the live session stream, watched by `useAwaitingAgent` for the agent's next envelope after a quick response/answer. Optional (defaults to `[]`, "never resolves") so existing callers/tests compile unchanged. */
  envelopes?: readonly Envelope[];
  /** 2026-07-19: `GET /api/session`'s `presence.agentSeen` -- optional (defaults to null/away) for the same reason. */
  agentSeen?: string | null;
  next?: BriefNext;
  /** R7-3/US15: glossary terms to detect in `say` -- omitted (or `[]`) degrades silently, GlossaryText's own contract. */
  terms?: readonly GlossaryTerm[];
  /** R7-3: opens a citation (this move's device/evidence, or its CitationStrip) in the Code tab -- lib/code-nav.ts. */
  onOpenCitation?: (target: CodeNavTarget) => void;
}): React.JSX.Element {
  const payload = frame.envelope.payload as unknown as PresentMovePayload;
  const [answer, setAnswer] = useState("");
  const [respondedWith, setRespondedWith] = useState<string | null>(null);
  const [showEvidence, setShowEvidence] = useState(false);

  // 2026-07-19 (P5's honest-pending indicator): two independent instances
  // -- the quick-response row and the free-answer box are two separate
  // controls ("only the just-clicked control shows pending"); `show-
  // evidence` never starts either wait (it's a local toggle, not a claim
  // sent to the agent for a reply, per this feature's own scope: "a
  // move_response that isn't show-evidence").
  const responseAwaiting = useAwaitingAgent(envelopes, agentSeen);
  const answerAwaiting = useAwaitingAgent(envelopes, agentSeen);

  const respond = (kind: (typeof QUICK_RESPONSES)[number]["kind"]): void => {
    if (kind === "show-evidence") setShowEvidence((prev) => !prev);
    void postMoveResponse(api, frame.envelope.id, kind).then((ack) => {
      setRespondedWith(kind);
      if (kind !== "show-evidence") responseAwaiting.begin(ack.seq);
    });
  };

  const sendAnswer = (): void => {
    if (!answer.trim()) return;
    void postMoveResponse(api, frame.envelope.id, "answer", answer).then((ack) => {
      setAnswer("");
      answerAwaiting.begin(ack.seq);
    });
  };

  return (
    <Brief
      established={established}
      {...(runningHead !== undefined ? { runningHead } : {})}
      headline={node?.question ?? "(node not found in the map)"}
      // interaction-model.md: intent is mandatory and always visible
      // (US11/ADR-007); `present_move.intent` is schema-OPTIONAL for
      // backward compat with a pre-round-7 move, so a move that omits it
      // still gets a neutral, honest fallback rather than a blank line --
      // ADOPTED CLARIFICATION, flagged in this step's report.
      intent={payload.intent ?? "Working through the current move."}
      {...(next !== undefined ? { next } : {})}
      terms={terms}
      {...(onOpenCitation ? { onOpenCitation } : {})}
    >
      {payload.device && <DeviceCard device={payload.device} frame={frame} api={api} />}
      <p className="move-brief-say">
        <GlossaryText
          text={payload.say}
          terms={terms}
          {...(onOpenCitation ? { onOpen: onOpenCitation } : {})}
        />
      </p>
      <p className="move-brief-ask">{payload.ask.text}</p>
      <div className="move-brief-answer">
        <textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Your answer…"
          rows={2}
        />
        <button
          type="button"
          className="btn-primary"
          onClick={sendAnswer}
          disabled={!answer.trim() || answerAwaiting.disableControl}
        >
          Send answer
        </button>
        <AwaitingAgentStatus state={answerAwaiting.state} label={answerAwaiting.label} />
      </div>
      <div className="move-brief-responses">
        {QUICK_RESPONSES.map((r) => (
          <button
            key={r.kind}
            type="button"
            className={respondedWith === r.kind ? "move-brief-response-active" : ""}
            onClick={() => respond(r.kind)}
            disabled={
              (respondedWith !== null && respondedWith !== "show-evidence") ||
              (r.kind !== "show-evidence" && responseAwaiting.disableControl)
            }
          >
            {r.label}
          </button>
        ))}
        <AwaitingAgentStatus state={responseAwaiting.state} label={responseAwaiting.label} />
      </div>
      {showEvidence && node && (
        <ul className="move-brief-evidence">
          {node.citations.map((citation, index) => (
            <li key={index}>
              {onOpenCitation ? (
                <button
                  type="button"
                  className="citation-link"
                  onClick={() => onOpenCitation(citationNavTarget(citation))}
                >
                  {citationLocationLabel(citation)}
                </button>
              ) : (
                citationLocationLabel(citation)
              )}
            </li>
          ))}
        </ul>
      )}
      <CitationStrip
        validation={frame.validation}
        {...(onOpenCitation ? { onOpen: onOpenCitation } : {})}
      />
    </Brief>
  );
}
