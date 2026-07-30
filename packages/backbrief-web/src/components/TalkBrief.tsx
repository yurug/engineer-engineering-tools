// Component: TalkBrief -- "This brief" content for the CURRENT talk slide:
// progress (slide N of talk_start.slideCount, done/here/upcoming), the
// slide's device/say/caption (grounded, reuse DeviceCard), a primary
// Continue (posts `talk_advance`) and an "ask about this step" box (posts
// `question`, which pauses advancement -- kb/spec/interaction-model.md), and
// a way to leave (`talk_exit`).
//
// kb/plan.md R7-2 shipped a STUB (headline/intent/device/say/caption inside
// the shared Brief shell, no continue/ask wiring); this step ("Talk view")
// completes it. Named unknown attacked FIRST (per this step's brief): "ask
// on a slide pauses advancement" -- lib/talk-fold.ts's `isTalkPaused`/
// `talkSlideThread` are the pure folds this component only renders; Continue
// disables exactly while `isTalkPaused` is true, and re-enables the render
// AFTER it flips false (the agent's `answer` matching the outstanding
// `question`'s own envelope id lands through the SAME WS stream every other
// live update here does -- no polling, no extra plumbing).
import { useState } from "react";
import { Brief, type BriefNext } from "./Brief";
import { CitationStrip } from "./CitationStrip";
import { DeviceCard } from "./DeviceCard";
import { GlossaryText } from "./GlossaryText";
import { TalkProgress } from "./TalkProgress";
import { AwaitingAgentStatus } from "./AwaitingAgentStatus";
import { postTalkAdvance, postTalkExit, postTalkQuestion } from "../lib/talk-api";
import { isTalkPaused, talkSlideThread, type CurrentTalk } from "../lib/talk-fold";
import { useAwaitingAgent } from "../lib/awaiting-agent";
import type { ApiConfig } from "../lib/api";
import type { CodeNavTarget } from "../lib/code-nav";
import type { DeviceSpec, Envelope, GlossaryTerm } from "@backbrief/shared/browser";

interface TalkStartPayload {
  title: string;
  slideCount: number;
}
interface TalkSlidePayload {
  index: number;
  say: string;
  device?: DeviceSpec;
  caption?: string;
}

const NO_TERMS: readonly GlossaryTerm[] = [];
const NO_ENVELOPES: readonly Envelope[] = [];

export function TalkBrief({
  api,
  established,
  runningHead,
  talk,
  envelopes = NO_ENVELOPES,
  agentSeen = null,
  next,
  terms = NO_TERMS,
  onOpenCitation,
}: {
  api: ApiConfig;
  established: readonly string[];
  runningHead?: string;
  talk: CurrentTalk;
  /** The full session stream -- `isTalkPaused`/`talkSlideThread` scan it for `question`/`answer` posted since this slide opened (App.tsx's own `envelopes`, already `seq`-ordered). Optional (defaults to `[]`, i.e. "never paused") so a caller that hasn't wired the pause feature yet still compiles and renders. 2026-07-19: the SAME stream feeds `useAwaitingAgent` for `talk_advance`/`question`. */
  envelopes?: readonly Envelope[];
  /** 2026-07-19 (P5's honest-pending indicator): `GET /api/session`'s `presence.agentSeen`, App.tsx's `presence.agentSeen` -- optional (defaults to null, i.e. "never seen"/away) so existing callers/tests compile unchanged. */
  agentSeen?: string | null;
  next?: BriefNext;
  terms?: readonly GlossaryTerm[];
  onOpenCitation?: (target: CodeNavTarget) => void;
}): React.JSX.Element {
  const start = talk.startFrame.envelope.payload as unknown as TalkStartPayload;
  const slide = talk.slideFrame.envelope.payload as unknown as TalkSlidePayload;
  const slideSeq = talk.slideFrame.envelope.seq;

  const paused = isTalkPaused(envelopes, slideSeq);
  const thread = talkSlideThread(envelopes, slideSeq);

  const [askText, setAskText] = useState("");
  const [pending, setPending] = useState<"advance" | "exit" | "ask" | null>(null);

  // 2026-07-19 (P5's honest-pending indicator, dogfood: "Continue felt
  // dead"): TWO independent instances, one per control -- "only the just-
  // clicked control shows pending" (the task's own requirement), and
  // Continue/ask ARE two separate controls that can each be used on their
  // own (asking does not require having just clicked Continue).
  const advanceAwaiting = useAwaitingAgent(envelopes, agentSeen);
  const askAwaiting = useAwaitingAgent(envelopes, agentSeen);

  function continueTalk(): void {
    setPending("advance");
    void postTalkAdvance(api)
      .then((ack) => advanceAwaiting.begin(ack.seq))
      .finally(() => setPending(null));
  }
  function exitTalk(): void {
    setPending("exit");
    void postTalkExit(api).finally(() => setPending(null));
  }
  function submitAsk(formEvent: React.FormEvent): void {
    formEvent.preventDefault();
    const trimmed = askText.trim();
    if (!trimmed) return;
    setPending("ask");
    void postTalkQuestion(api, trimmed)
      .then((ack) => {
        setAskText("");
        askAwaiting.begin(ack.seq);
      })
      .finally(() => setPending(null));
  }

  return (
    <Brief
      established={established}
      {...(runningHead !== undefined ? { runningHead } : {})}
      headline={start.title}
      intent={`Slide ${String(slide.index + 1)} of ${String(start.slideCount)} of this talk.`}
      {...(next !== undefined ? { next } : {})}
      terms={terms}
      {...(onOpenCitation ? { onOpenCitation } : {})}
    >
      <TalkProgress current={slide.index} total={start.slideCount} />
      {slide.device && <DeviceCard device={slide.device} frame={talk.slideFrame} api={api} />}
      <p className="move-brief-say">
        <GlossaryText
          text={slide.say}
          terms={terms}
          {...(onOpenCitation ? { onOpen: onOpenCitation } : {})}
        />
      </p>
      {slide.caption !== undefined && (
        <p className="talk-brief-caption">
          <GlossaryText
            text={slide.caption}
            terms={terms}
            {...(onOpenCitation ? { onOpen: onOpenCitation } : {})}
          />
        </p>
      )}
      <CitationStrip
        validation={talk.slideFrame.validation}
        {...(onOpenCitation ? { onOpen: onOpenCitation } : {})}
      />

      {thread.length > 0 && (
        <ul className="talk-brief-thread" data-testid="talk-thread">
          {thread.map((pair) => (
            <li key={pair.questionId} className="talk-brief-thread-item">
              <p className="talk-brief-thread-q">
                <span className="talk-brief-thread-who">you asked</span> {pair.questionText}
              </p>
              {pair.answerText !== null ? (
                <p className="talk-brief-thread-a">
                  <span className="talk-brief-thread-who">agent</span> {pair.answerText}
                </p>
              ) : (
                <p className="talk-brief-thread-waiting">waiting for the agent's answer…</p>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="talkact">
        <button
          type="button"
          className="btn-primary talkact-go"
          onClick={continueTalk}
          disabled={paused || pending !== null || advanceAwaiting.disableControl}
        >
          Continue →
        </button>
        <form className="talkact-ask" onSubmit={submitAsk}>
          <input
            value={askText}
            onChange={(e) => setAskText(e.target.value)}
            placeholder="or ask about this step…"
            aria-label="Ask about this step"
            disabled={pending === "ask" || askAwaiting.disableControl}
          />
        </form>
        <button
          type="button"
          className="talkact-exit"
          onClick={exitTalk}
          disabled={pending !== null}
        >
          Leave the talk
        </button>
        <span className="talkact-p" role="status">
          {paused ? "paused — waiting for the agent's answer" : "paused until you move"}
        </span>
        <AwaitingAgentStatus state={advanceAwaiting.state} label={advanceAwaiting.label} />
        <AwaitingAgentStatus state={askAwaiting.state} label={askAwaiting.label} />
      </div>
    </Brief>
  );
}
