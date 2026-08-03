---
name: inbrief
description: Build and run a grounded onboarding map for the accountable engineer before asking them to steer an unfamiliar project. Use proactively at the engineer-onboarding phase of a non-trivial workflow, and whenever the engineer needs a system-level mental model before making decisions.
---

# inbrief

Inbrief lets an agent propose a cited question graph while reserving mastery
signals for the engineer in the browser.

## Availability

Resolve Inbrief robustly: try `command -v inbrief`, then executable candidates
`$(npm prefix -g)/bin/inbrief`, `$HOME/.npm-global/bin/inbrief`,
`$HOME/.local/bin/inbrief`, and
`$HOME/work/dev/inbrief/packages/cli/dist/bin/inbrief.js`. Use the absolute path
found for every command. Only if all candidates fail may you say Inbrief is
absent. In that case, explain that it is installed by the public toolsuite, not
as a standalone npm package, and offer:

```sh
git clone https://github.com/yurug/engineer-engineering-tools.git \
  "$HOME/.local/share/engineer-engineering-tools"
"$HOME/.local/share/engineer-engineering-tools/install.sh" inbrief
```

Do not fall back until the user declines installation or installation fails.

Read the installed toolsuite's `docs/inbrief-cli.md` before the first session.
If its location is unknown, resolve the binary (`command -v inbrief`), then
locate the toolsuite checkout that owns the linked `@inbrief/cli` package.

## Session

1. Start with `inbrief serve --repo DIR --open`.
2. Identify 5–10 load-bearing questions whose answers determine whether the
   engineer can safely steer the work.
3. Post one `kind:"node"` record at a time with `inbrief act -`.
4. Post a prerequisite-respecting `kind:"agenda"` and tell the engineer the
   session URL.
5. Start the mandatory response sentinel described below, then let the engineer
   move mastery in the browser. Never post mastery or invent a
   question in their name.
6. If a node is contested, investigate the evidence. Correct the node; if the
   engineer was right, post `kind:"concession"`.
7. Post `kind:"finding"` for actionable defects, not as documentation.
8. The engineer closes the learning session; `inbrief stop` only stops the
   process.

## Response sentinel — mandatory while the browser is open

When the host supports subagents, launch a fast, low-cost subagent dedicated to
the human inbox. Otherwise run the same loop yourself. Keep a
`lastCommittedSeq`, repeatedly run `inbrief events --actor human --since
<lastCommittedSeq> --follow --timeout 20`, and relay every envelope to the main
agent immediately. Human input preempts the planned next step.

Advance the cursor only after the main agent has reacted or explicitly confirmed
that no action is needed, then relaunch. Before posting another node, stopping,
or giving a final answer, drain the inbox once more. The sentinel never claims
mastery or invents an engineer question.

## Node quality

Each node is one falsifiable question, not a topic:

- `id`: stable slug;
- `mode`: `tutorial` or `explanation`;
- `question`: at most 12 words;
- `answer`: at most 60 words;
- `citations`: at least one resolving code or KB citation;
- `requires`: explicit prerequisite ids, empty only when genuinely independent;
- `lifetime`: prefer `durable` only for design, otherwise `snapshot`.

Omit citation hashes and revisions; the server mints them. A refusal is feedback
to fix the claim or graph, never a reason to weaken validation.

## Exit criterion

The close statement must name covered, unknown, disputed, skipped/already-held
questions, unanswered engineer questions, map warnings, and findings. Do not
summarize onboarding as successful if any of those are silently omitted.

Run `inbrief propose` after a useful session. It prints proposals without
writing; review any durable learned material before committing it.
