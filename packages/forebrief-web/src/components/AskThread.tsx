// Component: AskThread -- renders a card's ask_why/ask_context/answer
// thread in place (kb/spec/algorithms.md's ask-context flow: "the thread
// IS these records"; T4: "pending ask_context does not block commit... the
// thread stays open"). Read-only: replying is the agent's job (`forebrief
// act`), never this UI's (the task brief: "you are not the UI" applies to
// the AGENT side of this exchange).
import { payloadField } from "../lib/records";
import type { Envelope } from "../lib/types";

function describeThreadEntry(envelope: Envelope): string {
  const text = payloadField(envelope.payload, "text");
  switch (envelope.type) {
    case "ask_why":
      return `asked why: ${text}`;
    case "ask_context":
      return `asked for context: ${text}`;
    case "answer":
      return `answer (re: seq ${payloadField(envelope.payload, "ref_seq")}): ${text}`;
    case "counter_proposal":
      return `you proposed studying instead: ${text}`;
    default:
      return text;
  }
}

/** Per-ask matching (T4, kb/spec/data-model.md's `answer.ref_seq`): an
 *  answer names the seq of the SPECIFIC ask_why/ask_context it replies to.
 *  "some answer exists anywhere in the thread" is a different question --
 *  it wrongly clears pending for an unanswered ask_context sitting next to
 *  an already-answered ask_why on the same card (the divergence this fixes;
 *  `digest.ts`'s `pendingAskContextsSection`/`hasAnswer` already matched
 *  this way server-side). */
function isAnswered(thread: readonly Envelope[], askSeq: number): boolean {
  return thread.some((e) => e.type === "answer" && e.payload["ref_seq"] === askSeq);
}

export function AskThread({ thread }: { thread: readonly Envelope[] }): React.JSX.Element | null {
  if (thread.length === 0) return null;
  // A counter-proposal is not a question, so it never puts the card in the
  // "awaiting the agent's answer" state; it gets its own line below.
  const asks = thread.filter((e) => e.type !== "answer" && e.type !== "counter_proposal");
  const counters = thread.filter((e) => e.type === "counter_proposal");
  const pendingAsk = [...asks].reverse().find((ask) => !isAnswered(thread, ask.seq));
  return (
    <div className="thread">
      {pendingAsk && (
        <div className="thread-pending">awaiting the agent's answer (seq {pendingAsk.seq})</div>
      )}
      {counters.length > 0 && (
        <div className="thread-pending">
          counter-proposal recorded (seq {counters[counters.length - 1]?.seq}). This card stays
          open: the agent studies your alternative and comes back with a revised card. You can still
          decide it as it stands.
        </div>
      )}
      {thread.map((e) => (
        <div className="thread-entry" key={e.seq}>
          [seq {e.seq}] {describeThreadEntry(e)}
        </div>
      ))}
    </div>
  );
}
