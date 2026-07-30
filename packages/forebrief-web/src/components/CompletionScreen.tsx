// Component: CompletionScreen -- NF4: "Completing the last card replaces
// the card view with the completion screen (summary + records). The
// export is never below the fold of a card view." App.tsx enforces the
// "never below" half by rendering EITHER CardView OR this, never both.
//
// card-copy.md's derived-surfaces rule (user feedback, seq 21: "Records
// section still renders raw card ULIDs + option keys -- same register
// violation as the reconciliation list, missed in the rule-6 fix pass"):
// every record line shows the card's PROMPT and, where a choice was made,
// the chosen/final option's LABEL -- never a bare id or key. The seq moves
// to a muted TRAILING locator (it was a leading `[seq N]` prefix before),
// matching AwaitingReconciliationList's own layout. Falls back to the raw
// id only when `cardIndex` has no entry for it (a card the index somehow
// doesn't know about).
import type { CardSummary } from "../lib/completion";
import { payloadField } from "../lib/records";
import type { CardSummary as CardIndexEntry, Envelope } from "../lib/types";

function heading(cardIndex: Record<string, CardIndexEntry>, cardId: string): string | undefined {
  if (!cardId) return undefined;
  const summary = cardIndex[cardId];
  return summary ? summary.prompt : `card ${cardId}`;
}

function optionLabel(
  cardIndex: Record<string, CardIndexEntry>,
  cardId: string,
  optionKey: string,
): string {
  return cardIndex[cardId]?.options.find((o) => o.key === optionKey)?.label ?? optionKey;
}

function describeRecord(e: Envelope, cardIndex: Record<string, CardIndexEntry>): string {
  const p = e.payload;
  const cardId = payloadField(p, "card");
  const named = heading(cardIndex, cardId);
  switch (e.type) {
    case "decision": {
      const chosen = payloadField(p, "chosen");
      return `decision — ${named}: chose ${optionLabel(cardIndex, cardId, chosen)} (${payloadField(p, "mode")})`;
    }
    case "reconciliation": {
      const final = payloadField(p, "final");
      const late = p["late"] === true ? " (late)" : "";
      return `reconciliation — ${named}: final ${optionLabel(cardIndex, cardId, final)} (${payloadField(p, "mode")})${late}`;
    }
    case "ask_why":
      return `ask_why — ${named}: ${payloadField(p, "text")}`;
    case "ask_context":
      return `ask_context — ${named}: ${payloadField(p, "text")}`;
    case "answer":
      return `answer — ${named} (re: seq ${payloadField(p, "ref_seq")}): ${payloadField(p, "text")}`;
    case "feedback":
      return `feedback${named ? ` — ${named}` : ""}: ${payloadField(p, "text")}`;
    default:
      return `${e.type}${named ? ` — ${named}` : ""}`;
  }
}

export function CompletionScreen({
  summaries,
  records,
  cardIndex,
}: {
  summaries: readonly CardSummary[];
  records: readonly Envelope[];
  cardIndex: Record<string, CardIndexEntry>;
}): React.JSX.Element {
  return (
    <div data-testid="completion-screen">
      <h1>Round complete</h1>
      <p className="done-mark">
        ✓ {summaries.length}/{summaries.length} committed
      </p>
      <div id="summary">
        {summaries.map((s) => (
          <div className="sum-row" key={s.cardId}>
            <b>{s.mode}</b>
            {s.prompt} → {s.chosenLabel}
            {s.rationale && <span className="rationale"> — {s.rationale}</span>}
          </div>
        ))}
      </div>
      <h2>Records</h2>
      <ul className="records">
        {records.map((e) => (
          <li key={e.seq}>
            {describeRecord(e, cardIndex)}
            <span className="locator"> (seq {e.seq})</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
