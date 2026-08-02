# Forebrief wire format

This is the agent-facing JSON reference for `forebrief post` and
`forebrief act`. Ingest boundaries are strict: unknown fields are rejected.
IDs, timestamps, actors, citation revisions, and hashes are server-produced.

## Cards

Post a round:

```json
{
  "title": "Storage decisions",
  "cards": [
    {
      "kind": "question",
      "prompt": "How should job execution survive a restart?",
      "context": "The scheduler promises at-most-once execution.",
      "options": [
        {
          "key": "1",
          "label": "Append-only log",
          "consequences": [{ "text": "Recovery replays durable records." }],
          "reversibility": { "class": "costly" }
        },
        {
          "key": "2",
          "label": "Rewrite snapshot",
          "consequences": [{ "text": "Writes are simpler but crash recovery is weaker." }],
          "reversibility": { "class": "reversible" }
        }
      ],
      "default": "1"
    }
  ]
}
```

A trickle post is `{ "card": CardSubmission }`. A card has:

- `kind`: `question` or `adr`;
- self-contained `prompt` and `context`;
- two to four options keyed `"1"` through `"4"`;
- `default`: one existing option key;
- option consequences with optional citations;
- reversibility class `reversible`, `costly`, or `irreversible`, with an optional `undo` citation;
- optionally one validated diagram or filmstrip spec at card level.

## Records

`forebrief act` accepts one record discriminated by `kind`. The common forms are:

```json
{"kind":"decision","card":"CARD_ID","chosen":"1","mode":"accepted-default","source_channel":"chat","rationale":"Replay makes recovery testable."}
{"kind":"decision","prompt":"Which clock owns due-time comparisons?","chosen":"fakeable-clock","mode":"provisional","source_channel":"chat","applied_state":{"commit":"WORKTREE","plan_step":"step-1"}}
{"kind":"reconciliation","card":"CARD_ID","final":"2","mode":"overridden","source_channel":"ui","late":false,"rationale":"The migration cost is unacceptable."}
{"kind":"answer","card":"CARD_ID","ref_seq":12,"text":"The log is fsynced before execution."}
{"kind":"feedback","card":"CARD_ID","text":"Show the crash boundary explicitly."}
{"kind":"sit_down","open":true}
{"kind":"fold","round_id":"ROUND_ID","commit":"abc1234","files":["kb/decisions-round-1.md"]}
```

Other human-originated records are `ask_why`, `ask_context`, and
`counter_proposal`; the browser normally authors those. A counter-proposal does
not decide its card.

For `decision`, exactly one of `card` or `prompt` is required. `mode` is
`accepted-default`, `override`, or `provisional`; provisional decisions require
`applied_state {commit, plan_step}`. `source_channel` is `ui`, `chat`, or
`file`. Rationale may be absent only after the tool's nudge has been handled.

Records append forever. Corrections and late decisions append reconciliation
records; they never rewrite history. Consumers take the highest sequence for
current state, while fold output preserves rationale and question threads
verbatim.
