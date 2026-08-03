---
name: forebrief
description: Run decision sessions with the human through forebrief — post decision cards to a local server + browser UI, log every decision (from chat, file, or the UI) to one append-only file, and fold decided rounds into the host repo's KB as a reviewable commit. Use whenever the repo is forebrief-enabled and you are about to make, or have just made, a decision the human should see — ambiguity rounds, plan-step approvals, ADR-shaped choices — instead of writing a questions-roundN.md file or deciding silently.
---

# forebrief

A local decision-session tool: you post decision cards, the human decides
(UI, chat, or a file edit), every decision lands in one durable log, and you
fold decided rounds into this repo's `kb/` as an ordinary reviewable commit.

## Is this repo forebrief-enabled?

Resolve Forebrief by trying `command -v forebrief`, then executable candidates
`$(npm prefix -g)/bin/forebrief`, `$HOME/.npm-global/bin/forebrief`,
`$HOME/.local/bin/forebrief`, and
`$HOME/work/dev/forebrief/packages/cli/dist/bin/forebrief.js`; use the absolute
path found. Then check `[ -f .forebrief/config.json ]`. Only when all binary
candidates fail or the config is absent is Forebrief not set up here — fall back to writing
`kb/questions-roundN.md` (spec-driven-dev's Phase 1 default) and stop reading
this file. Never half-apply this skill.

## Read the wire reference before posting

Card and record shapes are forebrief's fixed public protocol. Before the first
`post` or `act`, read [references/data-model.md](references/data-model.md) and
[references/cli.md](references/cli.md) in full. Never guess fields or use an
`E_SCHEMA` rejection as documentation.

## The eight commands

```
forebrief serve [--repo DIR] [--title T] [--port N] [--open]
forebrief post FILE.json | -        # a round {cards:[...]} or one trickle {card:{...}}
forebrief act FILE.json | -         # one record: decision, reconciliation, ask-context answer, ...
forebrief events [--since N] [--follow] [--timeout SECS] [--actor human]
forebrief status / forebrief digest / forebrief stop
forebrief fold --round ID | --card ID [--out DIR]   # fold-in generator, see below
```

Exit codes are uniform: `0` success · `2` success but degraded (a citation
was flagged — fix it or accept the conjecture rendering, never retry blindly)
· `1` error (message names the next command, e.g. `E_NO_SESSION` →
`forebrief serve`).

## P4 — every decision gets a record, from ANY channel

The failure this guards against: judging a call "obviously fine" and never
logging it. Rule: if it's an observable choice between stated alternatives,
it gets a record — whether it happened in the UI, in chat, or as a file edit
you made unilaterally. The moment you and the human land on a decision in
conversation, `act` it immediately with `source_channel:"chat"` (or `"file"`
for a decision implied by an edit) — do not batch this for later, and do not
treat "I'll just implement it" as a substitute for logging it.

## Provisional defaults (trickle, outside a sit-down)

Outside a live sit-down, never block on a human reply. Post the card, then
`act` a `decision` with `mode:"provisional"` applying its stated default —
this record MUST carry `applied_state:{commit, plan_step}` (schema-rejected
otherwise) so a later override reads as "reconciling X" against a named
state, not silent rewritten history. The human's eventual answer becomes a
`reconciliation` record referencing the same card; never edit the original.

## `--follow` only inside a sit-down

`events --follow` blocks waiting for live signal — legitimate only when a
`sit_down{open:true}` record is in force (human present, working a round with
you). Outside one, the CLI warns but does not refuse: treat the warning as a
bug in your own judgment, not a permission to ignore.

During that sit-down, a response sentinel is mandatory. When subagents are
available, assign a fast, low-cost one to repeatedly run `forebrief events
--actor human --since <lastCommittedSeq> --follow --timeout 20`; otherwise run
the same loop yourself. It relays each envelope immediately and advances its
cursor only after the main agent reacts or explicitly acknowledges it. Human
input preempts the next card. Drain the inbox before posting another card,
closing the sit-down, stopping, or giving a final answer.

## Threads: ask-why and ask-context

`ask_why`/`ask_context` never block a card's decidability. Reply with an
`answer` record (`ref_seq` = the asking record's seq); the thread IS these
records, nothing else — there is no separate summary field to keep in sync.

## Fold workflow

After a round closes (every card decided), fold it into the KB:

1. `forebrief fold --round ID` (or `--card ID` for one `adr`-kind card) to
   stdout, or `--out DIR` (a scratch dir OUTSIDE `.forebrief/` — never inside
   it) to get a file on disk.
2. Review the generated file yourself: rationale and threads are rendered
   verbatim from the log already, but frontmatter, placement, and prose
   around them are yours to check.
3. Move/copy it into the path `.forebrief/config.json`'s `foldIn` block
   names (`roundsDir` for round digests, `adrDir` for ADR-kind cards), commit
   it as an ordinary change. YOU author this commit — the server never
   writes into `kb/` (ADR-005), and `fold` itself only ever writes to `--out`
   or stdout.
4. Run this repo's kb-lint AND `kb-lint-forebrief.py` before committing —
   both must pass. A verbatim-check failure means you paraphrased a
   rationale or thread; fix the prose, never the check.

## Card copy

Cards are read cold, with no session context. State the whole question and
default in the card itself — no finding numbers, no invented shorthand
readable only in your own transcript.
