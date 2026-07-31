// Module: claim/assertion-heuristic -- "a sentence that asserts; a topic
// phrase is a spec error" (kb/primitives/spec.md#5-assertion-evidence-card,
// P-F: "every assertion-evidence card's headline is a claim, never a topic
// phrase"). No NLP dependency (P-D: this package adds no weight it can't
// justify) -- a defensible, fully-documented, CLOSED-list heuristic
// instead of a real parser.
//
// THE HEURISTIC, EXACTLY:
//   1. Fewer than MIN_ASSERTION_WORDS words -> rejected. A topic phrase is
//      typically a short noun phrase ("Q3 Revenue", "System Overview");
//      three words is the shortest plausible subject+verb+complement.
//   2. No word (case-insensitively, stripped of leading/trailing
//      punctuation) is an EXACT match in ASSERTION_VERB_WORDS -> rejected.
//      This is a closed, enumerable list of common English finite-verb
//      tokens (the full set of grammatical auxiliaries/modals/copulas,
//      plus a curated set of common technical/argumentative main verbs and
//      their standard inflections) -- NOT a suffix pattern like "ends in
//      -s/-ed/-ing", which would false-accept plural nouns ("Latency
//      issues across regions" -- "issues" ends in -s but is a noun, not a
//      verb; an exact-token match against a real verb list correctly
//      rejects this as a topic phrase).
//   3. Otherwise -> accepted.
//
// KNOWN, DOCUMENTED LIMITATION: this is a closed list, not a POS tagger.
// A genuine assertion using a verb absent from ASSERTION_VERB_WORDS is
// (incorrectly) rejected. The fix for a real false-reject is adding the
// missing verb to the list below, in the SAME commit as the KB note
// recording it -- never loosening check 2 to a suffix/substring match,
// which would reopen the plural-noun false-accept this design avoids.
const MIN_ASSERTION_WORDS = 3;

// The 24 grammatical auxiliaries/modals/copulas of English, in their
// common inflections -- a complete, closed set (not curated by taste).
const AUXILIARY_AND_MODAL_VERBS = [
  "am",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "shall",
  "should",
  "can",
  "could",
  "may",
  "might",
  "must",
  "ought",
];

// A curated set of common technical/argumentative main verbs, each with
// its standard inflections -- not exhaustive (see the header's documented
// limitation), sized for realistic technical assertions.
const MAIN_VERB_FAMILIES = [
  "show,shows,showed,showing",
  "mean,means,meant,meaning",
  "cause,causes,caused,causing",
  "increase,increases,increased,increasing",
  "decrease,decreases,decreased,decreasing",
  "reduce,reduces,reduced,reducing",
  "improve,improves,improved,improving",
  "degrade,degrades,degraded,degrading",
  "fail,fails,failed,failing",
  "break,breaks,broke,broken,breaking",
  "exceed,exceeds,exceeded,exceeding",
  "violate,violates,violated,violating",
  "require,requires,required,requiring",
  "enable,enables,enabled,enabling",
  "block,blocks,blocked,blocking",
  "allow,allows,allowed,allowing",
  "prevent,prevents,prevented,preventing",
  "confirm,confirms,confirmed,confirming",
  "reveal,reveals,revealed,revealing",
  "demonstrate,demonstrates,demonstrated,demonstrating",
  "indicate,indicates,indicated,indicating",
  "suggest,suggests,suggested,suggesting",
  "imply,implies,implied,implying",
  "support,supports,supported,supporting",
  "contradict,contradicts,contradicted,contradicting",
  "matter,matters,mattered,mattering",
  "drive,drives,drove,driven,driving",
  "change,changes,changed,changing",
  "grow,grows,grew,grown,growing",
  "shrink,shrinks,shrank,shrunk,shrinking",
  "remain,remains,remained,remaining",
  "stay,stays,stayed,staying",
  "hold,holds,held,holding",
  "win,wins,won,winning",
  "lose,loses,lost,losing",
  "cost,costs,costing",
  "save,saves,saved,saving",
  "add,adds,added,adding",
  "remove,removes,removed,removing",
  "beat,beats,beaten,beating",
  "miss,misses,missed,missing",
  "hit,hits,hitting",
  "fix,fixes,fixed,fixing",
  "solve,solves,solved,solving",
  "explain,explains,explained,explaining",
  "prove,proves,proved,proving",
  "need,needs,needed,needing",
  "want,wants,wanted,wanting",
  "work,works,worked,working",
  "come,comes,came,coming",
  "use,uses,used,using",
  "move,moves,moved,moving",
  "get,gets,got,gotten,getting",
  "make,makes,made,making",
  "take,takes,took,taken,taking",
  "give,gives,gave,given,giving",
  "let,lets,letting",
  "keep,keeps,kept,keeping",
  "go,goes,went,gone,going",
  "assert,asserts,asserted,asserting",
];

/** Every recognized finite-verb token, lowercased. */
export const ASSERTION_VERB_WORDS: ReadonlySet<string> = new Set([
  ...AUXILIARY_AND_MODAL_VERBS,
  ...MAIN_VERB_FAMILIES.flatMap((family) => family.split(",")),
]);

function stripPunctuation(word: string): string {
  return word.replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, "");
}

export interface AssertionCheck {
  ok: boolean;
  /** Present only when `!ok` -- why this string reads as a topic phrase
   *  rather than an assertion. */
  reason?: string;
}

/**
 * @invariant PR7 -- the caller (../claim/spec.ts) attaches this reason to
 *   a field-path issue at `["assertion"]`, never a generic message.
 */
export function looksLikeAssertion(text: string): AssertionCheck {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length < MIN_ASSERTION_WORDS) {
    return {
      ok: false,
      reason:
        `too short to assert anything (${String(words.length)} word(s)) -- a topic ` +
        `phrase like "Q3 Revenue" is exactly this shape; an assertion needs a ` +
        `subject and a verb`,
    };
  }
  const hasVerb = words.some((w) =>
    ASSERTION_VERB_WORDS.has(stripPunctuation(w).toLowerCase()),
  );
  if (!hasVerb) {
    return {
      ok: false,
      reason:
        `no recognized verb found -- reads as a topic phrase/label, not a claim ` +
        `(e.g. "Latency By Region"); rewrite as a sentence that asserts something ` +
        `(e.g. "Latency degrades under concurrent load")`,
    };
  }
  return { ok: true };
}
