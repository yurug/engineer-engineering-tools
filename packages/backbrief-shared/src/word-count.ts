// Module: word-count -- the ONE definition of "word" every attention-budget
// check (P12) counts against.
//
// Implements kb/spec/pedagogy-engine.md's "Budgets are counted in
// whitespace-separated words" and kb/properties/functional.md#P12. This is
// deliberately the tiniest possible function: splitting on runs of
// whitespace and dropping empty segments is the whole algorithm, and every
// caller (present_move's say/ask.text, MapNode's question/answer, device
// labels) shares it so "what counts as a word" can never drift between
// call sites -- kb/plan.md step 1's named unknown ("can the skill reliably
// produce in-budget moves") depends on the agent and the server agreeing
// on the SAME count, or every move becomes a guessing game against an
// invisible rule.
// Key design decision: no locale-aware tokenization, no hyphen-splitting,
// no punctuation stripping -- "grasped-vs-demonstrated" is one word, "it's"
// is one word, an em-dash surrounded by spaces is its own word. This
// matches how a human skimming the text would eyeball a word count, which
// is the budget's whole point (Rule 0: the agent's generation speed vs the
// human's evaluation bandwidth).
export function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed === "") return 0;
  return trimmed.split(/\s+/).length;
}

/**
 * @param text the field's content
 * @param limit the field's word budget (inclusive)
 * @returns true if `text` is AT OR UNDER `limit` words
 * @invariant P12 the single predicate every budget check (pedagogy.ts,
 *   comprehension-map.ts) composes -- never re-implemented ad hoc
 */
export function withinWordBudget(text: string, limit: number): boolean {
  return countWords(text) <= limit;
}
