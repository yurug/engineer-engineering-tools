// Component: QuestionBox -- the engineer asks; nothing waits for an answer.
//
// The session was one-directional until the first tezqed run: claim mastery on a
// node, and nothing else. A question the engineer could not ask was a hole in the
// map the tool never learned about (ADR-030).
//
// @invariant FIRE AND FORGET. Submitting clears the box and returns immediately.
//   No spinner, no answer arriving mid-session, no request the engineer waits on,
//   because the cost of waiting is exactly why the question would go unasked.
// @invariant a failed send is SAID. Swallowing it would be the worst outcome
//   here: the engineer believes their question is recorded and it is nowhere.
import { useState } from "react";

export function QuestionBox({
  nodeId,
  onAsk,
}: {
  /** The node on screen, so the agent knows what was in front of them. */
  nodeId: string;
  onAsk: (text: string) => Promise<void> | void;
}): React.JSX.Element {
  const [text, setText] = useState("");
  const [asked, setAsked] = useState(0);
  const [failed, setFailed] = useState(false);

  const submit = (): void => {
    const question = text.trim();
    if (question === "") return;
    // Cleared before the send resolves, on purpose: the box is usable again
    // immediately and the engineer is already reading on.
    setText("");
    setFailed(false);
    void Promise.resolve(onAsk(question)).then(
      () => setAsked((n) => n + 1),
      () => {
        setFailed(true);
        setText(question); // handed back rather than lost
      },
    );
  };

  return (
    <form
      className="question-box"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label htmlFor="ask">Ask something, answered later</label>
      <textarea
        id="ask"
        rows={2}
        value={text}
        placeholder={`About "${nodeId}", or anything else`}
        onChange={(e) => setText(e.target.value)}
        // A textarea swallows Enter, so the keyboard commit is the one every
        // multi-line box in this family uses. Discovered in forebrief, where a
        // counter-proposal was silently lost to exactly this.
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
        }}
      />
      <div className="question-box-foot">
        <button type="submit" disabled={text.trim() === ""}>
          Ask
        </button>
        {failed ? (
          <span role="alert" className="question-failed">
            Not sent. Your question is back in the box.
          </span>
        ) : asked > 0 ? (
          <span data-testid="asked-count">
            {asked} question{asked === 1 ? "" : "s"} noted for later
          </span>
        ) : null}
      </div>
    </form>
  );
}
