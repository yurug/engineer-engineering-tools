// Module: lib/talk-fold -- finds the CURRENTLY open talk's `talk_start`
// frame and its latest `talk_slide` frame, for TalkBrief.tsx's rendering
// (kb/plan.md R7-2 introduced the stub; R7-3 is the full talk view: slides +
// progress + continue/ask), plus the "ask on a slide pauses advancement"
// rule this step's named unknown attacks first.
//
// shared/talk.ts's `foldTalkState` gives open/lastSlideIndex only -- enough
// for SERVER-side sequencing (checkTalkSlideSequencing). The web also needs
// the slide's own say/device/caption and the talk's title/slideCount to
// render anything, plus each frame's `validation` array (DeviceCard needs
// it for citation alignment, same as MoveBrief's `frame` prop) -- so this
// returns the two ENVELOPE FRAMES themselves, not just their payloads,
// mirroring App.tsx's own `findCurrentMove` pattern rather than duplicating
// foldTalkState's index-only bookkeeping.
import type { Envelope } from "@backbrief/shared/browser";
import type { EnvelopeFrame } from "./use-backbrief-socket";

export interface CurrentTalk {
  startFrame: EnvelopeFrame;
  slideFrame: EnvelopeFrame;
}

/**
 * @param frames the session's envelope-frame stream, in receive order
 *   (App.tsx's own `frames` -- WS delivery order IS seq order, P6)
 * @returns the open talk's `talk_start` frame plus its most recently
 *   posted `talk_slide` frame; null if no talk is open, or one is open but
 *   no slide has been posted yet (nothing to render in either case --
 *   the caller falls through to the next brief-content kind)
 * @invariant mirrors shared/talk.ts's `foldTalkState` open/closed rule
 *   exactly: `talk_start` opens (and resets the slide), `talk_end`/
 *   `talk_exit` closes; the most recent of the three wins.
 */
export function findCurrentTalk(frames: readonly EnvelopeFrame[]): CurrentTalk | null {
  let startFrame: EnvelopeFrame | null = null;
  let slideFrame: EnvelopeFrame | null = null;
  for (const frame of frames) {
    const type = frame.envelope.type;
    if (type === "talk_start") {
      startFrame = frame;
      slideFrame = null;
    } else if (type === "talk_slide" && startFrame) {
      slideFrame = frame;
    } else if (type === "talk_end" || type === "talk_exit") {
      startFrame = null;
      slideFrame = null;
    }
  }
  if (!startFrame || !slideFrame) return null;
  return { startFrame, slideFrame };
}

interface AnswerPayload {
  questionId?: string;
  text?: string;
}

interface QuestionPayload {
  text?: string;
}

/**
 * kb/spec/interaction-model.md's talk protocol: "Asking on a slide reuses
 * `question { text, ... }` -- it pauses advancement (the UI does not
 * auto-continue); the agent answers, then the human advances." The protocol
 * never introduces a stored "paused" flag -- like everything else in this
 * module, it is a fold: a `question` posted AFTER the current slide opened
 * pauses the talk until a matching `answer{questionId}` (naming that exact
 * question's own envelope id, the SAME referencing convention `move_response`
 * already uses for `moveId`) closes it. Multiple outstanding questions are
 * tracked individually (a set, not a boolean) so answering an EARLIER
 * question while a LATER one is still open correctly leaves the talk paused.
 *
 * @param envelopes the session's full envelope stream, any order (sorted
 *   here by `seq` -- this module's other functions assume WS delivery
 *   order, but this one is called with the same `envelopes` App.tsx already
 *   sorts nowhere else, so it re-sorts defensively rather than trusting the
 *   caller)
 * @param sinceSeq the current slide's own `seq` (`slideFrame.envelope.seq`)
 *   -- a question asked on a PRIOR slide can never leave this one paused,
 *   because Continue is disabled while any question is outstanding (this
 *   function's own caller, TalkBrief.tsx), so a new slide can only ever
 *   appear once every earlier question is already answered
 * @returns true if at least one `question` posted since `sinceSeq` has no
 *   matching `answer` yet
 * @invariant P6 -- pure fold, no stored pause flag; rebuildable from zero
 */
export function isTalkPaused(envelopes: readonly Envelope[], sinceSeq: number): boolean {
  const sorted = [...envelopes].sort((a, b) => a.seq - b.seq);
  const outstanding = new Set<string>();
  for (const envelope of sorted) {
    if (envelope.seq <= sinceSeq) continue;
    if (envelope.type === "question") {
      outstanding.add(envelope.id);
    } else if (envelope.type === "answer") {
      const questionId = (envelope.payload as unknown as AnswerPayload).questionId;
      if (questionId !== undefined) outstanding.delete(questionId);
    }
  }
  return outstanding.size > 0;
}

export interface TalkQaPair {
  questionId: string;
  questionText: string;
  /** null while outstanding -- the SAME "no matching answer yet" condition `isTalkPaused` checks, computed independently here so TalkBrief.tsx can render the thread without re-deriving it from `isTalkPaused`'s boolean. */
  answerText: string | null;
}

/**
 * The current slide's own question/answer thread, in the order asked --
 * TalkBrief.tsx renders this alongside the pause state so the human can see
 * BOTH what they asked and whether it's been answered yet, not just a bare
 * "paused" flag.
 * @param sinceSeq the current slide's own `seq`, same scoping as `isTalkPaused`
 */
export function talkSlideThread(envelopes: readonly Envelope[], sinceSeq: number): TalkQaPair[] {
  const sorted = [...envelopes].sort((a, b) => a.seq - b.seq);
  const pairs: TalkQaPair[] = [];
  const indexById = new Map<string, number>();
  for (const envelope of sorted) {
    if (envelope.seq <= sinceSeq) continue;
    if (envelope.type === "question") {
      const text = (envelope.payload as unknown as QuestionPayload).text ?? "";
      indexById.set(envelope.id, pairs.length);
      pairs.push({ questionId: envelope.id, questionText: text, answerText: null });
    } else if (envelope.type === "answer") {
      const payload = envelope.payload as unknown as AnswerPayload;
      const index =
        payload.questionId !== undefined ? indexById.get(payload.questionId) : undefined;
      if (index !== undefined && payload.text !== undefined)
        pairs[index]!.answerText = payload.text;
    }
  }
  return pairs;
}
