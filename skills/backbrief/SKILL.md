---
name: backbrief
description: Open a live, grounded comprehension session with the human over this repo — teach the comprehension map one budgeted move at a time (question, device, say, ask), watch got-it/not-clear/that's-wrong/show-evidence arrive in real time, and let mastery advance only through the human. Use when the human asks to walk through a change, explain how something works, or review code together live — AND proactively when you have just finished a non-trivial change and the human should understand it before moving on.
---

# backbrief

A local server + browser UI where you teach this repo as a **comprehension
map**: a question-labeled graph, each node cited to real code/KB, walked one
budgeted **move** at a time. Only the human advances a node to grasped/
demonstrated; you propose and verify, never grade yourself.

## The quality bar — before you show ANYTHING

Every move, slide, card, and brief must pass `conventions/explanation-quality.md`
or you rewrite it: one plain **message** the user could repeat back · every term
**met or boxed** · **no list doing an explanation's job** (names are evidence,
one click away) · the **so-what** (consequence for their model) · one new idea,
**concrete first**. A command list is not an explanation. A passing word budget
is necessary, never sufficient — frugal-but-empty is still empty.

## When to open one

Don't wait to be asked: after landing a non-trivial change, offer a session.
It's also the right answer to "explain X", "how does Y work", "review this
diff". A contest or "not clear" means a model is wrong — dig in.

## Build the map first

Before teaching, `map_upsert` the region: 5–15 nodes (prefer 20 load-bearing
over 60 trivial). Each needs `id`, `type`, `level`, a `question` (≤12 words),
an `answer` (≤30 words), `requires` (prerequisite ids — a DAG, and none may
point at a `retired` node), and ≥1 citation that validates. A node must be
**citable and falsifiable**: if you can't name the check that would fail were
the answer wrong, it isn't a node. Rejects return `E_MAP_VALIDATION` naming
the node id and rule — fix and resubmit.

## Teach: one move at a time

Your agenda is the **frontier** (`GET /api/map`'s `frontier`) — nodes whose
prerequisites are grasped/demonstrated and whose own state isn't yet. Never
present off the frontier. Per move:

1. **New region → calibration first**: no device, `ask.kind: "calibration"` —
   learn what they already think before showing anything.
2. **One node, one device** (trace may embed a `memory` snapshot — the only
   composite). Pick by question shape: "what if X" → `scenario`; "step by
   step" → `trace`; "which states/modes" → `state-machine`; "what's in the
   store" → `memory`; "what's guaranteed" → `law`. `trace`/`state-machine`
   are user-stepped, never autoplay.
3. `say` ≤25 words, `ask.text` ≤15; the node's `question` shows automatically,
   don't repeat it. Device labels ≤4 words, a `law`'s `reading` ≤20. Write
   it, then delete a third.
4. Over budget → `E_OVER_BUDGET`, hard reject naming field/count/limit. Fix
   and resend.
5. After 2 "not clear" on one node: stop re-explaining, step back a `requires`
   edge or flag it mis-leveled.

The human's `move_response`: `answer` (their guess — you reply with a verdict
`say`, THEY confirm via the UI one-click, never you), `got-it` (→ grasped),
`not-clear` (→ shaky, drop a level), `thats-wrong` (→ contested, dig in),
`show-evidence` (expands citations, no state change). You can't post any of
these — only `present_move`/`map_upsert` are yours; overlay events are human-only.

## Let them explore

They may stop answering and just navigate/annotate — the session infers
**exploring** after ~3 idle minutes (or they set it). While exploring, do NOT
post moves; their signals queue. On return to **dialogue**, debrief the queued
annotations FIRST, then resume the agenda. (Nothing server-side blocks a move
mid-explore yet — this restraint is on you.)

## Rupture: when comprehension surfaces a defect

Contested node, spec/impl mismatch, or mis-leveled node → `open_finding`, then
`propose_change_break {findingId, plan}`. Wait for the human's
`change_break_response`. Accepted → `pause_for_change {findingId}` (skip the
accept → `E_VALIDATION`, not a pause). Fix the repo through your normal
workflow — backbrief never touches anything outside `.backbrief/`, nor should
you on its behalf. Then `resume_session {summary}`: status → active, the server
re-checks citations and emits `nodes_invalidated` — your next moves must
delta-brief exactly those before the agenda. Small fixes stay in-session; a
large one ends the session and gets queued for its own run.

## Cross-session ritual (resuming a repo)

1. Read `backbrief digest` — its "Comprehension map" section lists states,
   frontier, and contested/invalidated nodes.
2. `invalidated` nodes (citation broke since last time) → delta-brief FIRST.
3. At most 2 light re-checks on `shaky`/long-untouched `demonstrated` threshold
   nodes (not a flashcard deck).
4. Then the frontier agenda, threshold nodes first.

## The six commands

```
backbrief serve [--repo DIR] [--focus diff:A..B|component:PATH|system] [--port N] [--title T] [--open]
    → {url, token, port, sessionId, pid} — ONE line, then it daemonizes.
backbrief act FILE.json | act -   → posts one action; prints report;
      exit 0 valid, 2 flagged, 1 error/rejected.
backbrief events [--since N] [--follow] [--timeout SECS] [--actor human]
    → prints Envelopes as JSONL, oldest first — your live signal.
backbrief status / backbrief digest / backbrief stop
```

## Response sentinel — mandatory while the browser is open

Do not rely on a held background process waking the main agent. If the host
supports subagents, launch one fast/low-cost subagent whose only job is the
response inbox; otherwise run the same loop yourself:

1. Keep `lastCommittedSeq` (start at `0`). Run `backbrief events --actor human
--since <lastCommittedSeq> --follow --timeout 20` in the background.
2. On output, read every envelope in `seq` order and relay it to the main agent
   immediately. Human input preempts the next planned move.
3. The main agent reacts before presenting anything else. For an action caused
   by an envelope, use a deterministic `clientKey` derived from its `id`, so a
   replay cannot duplicate the reaction.
4. Advance `lastCommittedSeq` only after the reaction succeeds (or the main
   agent explicitly acknowledges that no action is needed), then relaunch.

The sentinel may classify and relay; it must never invent a human response,
advance mastery, or settle `not-clear`/`thats-wrong` without the main agent.
Before every `present_move`, session stop, and final answer, drain from
`lastCommittedSeq` once more. A timeout with no output is not completion:
relaunch while the browser session remains active.

## The citation rule

`path` is repo-relative, lines 1-based inclusive; omit `rev`/`contentHash`, the
server mints both — **never invent a hash**. `act` exit `2` = drifted/broken
(still posted; re-cite). All-broken device → `E_UNGROUNDED_DIAGRAM`. A KB
`anchor` is a heading slug or property ID (`P4`) — **never** a frontmatter
`id:`; that looks valid and silently never resolves.

## Presence and legacy actions

Presence shows present/away from your last CLI call; a held `events --follow`
counts as present. Legacy `post_card`/`show_diagram`/tours still POST but the v2
UI renders none — treat them as inert; teach through moves.
