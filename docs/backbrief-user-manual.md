# backbrief user manual


> **Note (2026-07-26): this manual describes the v1 session model** (tours, cards,
> the coverage map). The v2 UI teaches through a comprehension map and one move per
> screen; the legacy actions still post but the interface no longer renders them.
> The README and `skills/backbrief/SKILL.md` are current; this walkthrough is kept
> for the parts that did not change (navigation, annotations, findings,
> troubleshooting) and is being reconciled.

This is the deeper companion to the root [`README.md`](../README.md): a full walked
example of a comprehension session, the coverage map, diff-focused sessions, no-KB mode,
what degraded states look like, and troubleshooting. Every command and every piece of
JSON below was run against a real, disposable git repo to verify it — nothing here is
aspirational. Field values (ports, tokens, ULIDs, timestamps) will differ on your
machine; the shapes will not.

If you're integrating an agent, start with
[`skills/backbrief/SKILL.md`](../skills/backbrief/SKILL.md) instead — this manual is
written for the human side of the session.

## A full session, end to end

### 1. The agent starts the session

The agent (or you, from a terminal) runs `serve` from the repo it wants a session over:

```bash
backbrief serve --repo . --title "Walkthrough session 1"
```

```json
{
  "url": "http://127.0.0.1:39601/?token=518a...",
  "token": "adca...",
  "port": 39601,
  "sessionId": "01KX9Z0CCC1PT5VCHYJXZPTFDR",
  "pid": 3012788
}
```

You open `url` in a browser. That's the whole entry procedure — no login, no separate
auth flow; the token in the URL is your session.

### 2. The agent posts a tour

The agent narrates with a **tour**: a `tour_start`, one `tour_step` per step, then a
`tour_end`, each posted with `backbrief act`. Every step's citations are checked before
it renders:

```bash
backbrief act tour_start.json   # {title, question, stepCount}
backbrief act tour_step0.json   # {index: 0, card: {markdown, title, refs: [...]}}
backbrief act tour_step1.json   # {index: 1, card: {...}}
backbrief act tour_end.json     # {summary?}
```

Each `act` call prints the validation report for that step's citations, e.g.:

```json
{
  "id": "01KX9Z0MYEW1AR1SXQFFHARF7J",
  "seq": 2,
  "report": {
    "results": [
      {
        "citation": {
          "kind": "code",
          "path": "src/retry.js",
          "startLine": 1,
          "endLine": 3,
          "rev": "worktree",
          "contentHash": "2c25f..."
        },
        "state": "valid"
      }
    ],
    "flagged": 0
  }
}
```

`flagged: 0` means every citation in that step resolved. In the browser, the tour player
reveals one step at a time and only advances after you acknowledge it (`tour_ack`) — the
agent may post the whole tour in a burst; pacing is UI-owned, not agent-owned.

### 3. You respond: annotate, mark understood, contest, open a finding

These are things you do in the browser — clicking "annotate" on a code region, the
"understood" control on a file, "contest" on a section you don't buy, and "open finding"
on something that looks like a real bug. Underneath, each is a durable event
(`POST /api/events`, acknowledged only after it's fsynced to disk — P2):

- **Annotate** a region with a note, a concern, or a "disagree" — e.g. leaving a
  `concern`-kind annotation on the cited retry loop asking whether the attempt count
  should be capped.
- **Mark understood** on `src/retry.js` — this is the one signal only you can give; the
  agent can never set it (P4). It's what makes session N+1 skip re-explaining this file.
- **Contest** a section — here, the KB page the tour cited, because it turned out not to
  actually document the function it was cited for. Contesting is a stronger, structural
  verdict than an annotation; it changes that target's reader state to `contested`.
- **Open a finding** — a durable record that `retry()` silently discards every error
  except the last one, with the citation that shows it.

### 4. The agent reacts and resolves the finding

The agent's `backbrief events --follow` (running as a background process) prints each of
your events the instant they land, e.g.:

```json
{"seq":9,"actor":"human","type":"open_finding","payload":{"title":"retry() swallows all but the last error","body":"...","citations":[...]}}
```

The agent resolves it with `act` (findings are one of the few event types — alongside
`answer`, `kb_proposal`/`resolve_proposal` — an agent may post directly, not just the
human):

```bash
backbrief act resolve_finding.json   # {findingId: "<the open_finding envelope's id>", resolution}
```

### 5. Before ending, the agent reads the digest

```bash
backbrief digest
```

```markdown
# backbrief state digest

Generated: 2026-07-12T01:29:02.398Z

## Coverage map

unseen=5 visited=0 questioned=0 understood=1 contested=1

### Contested / questioned targets (2)

- kb (contested)
- kb/INDEX.md (contested)

### Understood targets (2) -- skip re-explaining these (US7)

- src (understood)
- src/retry.js (understood)

## Open questions

_None._

## Open findings

_None._

## Open KB proposals

_None._

## Recent sessions

- Walkthrough session 1 (2026-07-12T01:27:58.093Z)
```

The resolved finding no longer appears under "Open findings" — the digest only ever
lists what's still open. Then:

```bash
backbrief stop
```

### 6. Session two starts already knowing what session one confirmed (US7)

Start a new session on the same repo and read the digest again, before posting anything:

```bash
backbrief serve --repo . --title "Walkthrough session 2"
backbrief digest
```

The coverage counts and the understood/contested lists are unchanged — `src/retry.js`
is still `understood`, `kb/INDEX.md` is still `contested` — because reader state is
folded across **every** session on this repo, oldest to newest (`reader-state.jsonl` is
the durable incremental fold). This is the whole mechanism behind US7: the agent reads
this digest at session start and never re-explains ground you already marked understood.
Only "Recent sessions" changed, gaining the new session's title.

## The coverage map

The coverage map is the aggregate view of **reader state** — `unseen | visited |
questioned | understood | contested` — across every code file, KB file, and property ID
in the repo. It's a map, never a numeric grade. A directory aggregates its children with
worst-status-wins ordering (`contested > unseen > questioned > visited > understood`), so
a single contested file makes its parent directory show as contested too. Fetch the full,
untruncated map with:

```
GET /api/coverage
```

The digest (above) is a _summary_ of the same data, hard-capped at 150 lines so it's
always safe for the agent to read wholesale — lists truncate oldest-first but counts stay
exact.

`understood` **decays** back to `visited` (with a `decayedFrom: understood` marker) when
the underlying file changes in a later commit — the coverage map shows this as "was
understood, changed since," not a plain unseen/visited state, so you know it's ground you
need to re-confirm rather than ground you never covered.

## Diff-focused sessions

Scope a whole session to a diff instead of the whole repo:

```bash
backbrief serve --repo . --title "Review the retry change" --focus "diff:main..HEAD"
```

`--focus diff:FROM..TO` accepts any two git refs; `TO` defaults to `worktree` if omitted
(`diff:main..`), matching how a code citation's own `rev` defaults. The session's
`focus` comes back on `GET /api/session` as `{"kind":"diff","from":"main","to":"HEAD"}`,
and the web app switches to a guided, per-file diff walkthrough (hunks load lazily, one
file at a time — repos of any size stay fast) instead of the free-navigation tree. A tour
run inside a diff-focused session can cite the changed worktree lines directly.

`--focus component:path/to/dir` scopes a session to one part of the tree the same way,
without the diff semantics.

## No-KB mode

If a repo has no `kb/INDEX.md` and no `kbDir` set in `.backbrief/config.json`, backbrief
starts in **no-KB mode** rather than failing: `GET /api/session` reports
`"noKbMode": true`, the browser shows an explicit notice (never a silent downgrade), and
the KB browser pane is hidden. Free navigation, code citations, annotations, and tours
over code all work exactly as normal. The one thing that's structurally impossible is a
challenge question, since `ask_question` requires a KB anchor to cite (P9) — the agent
gets back:

```json
{
  "error": {
    "code": "E_KB_MISSING",
    "message": "no KB is configured for this repo -- ask_question (P9) requires a KB anchor to challenge"
  }
}
```

`backbrief act` exits 1 in this case, with that same message on stderr.

## Degraded states

backbrief is built to degrade visibly, never silently and never by breaking (P8). None of
the following are errors — they're normal, expected conditions with a specific UI
treatment.

**Agent away.** If the agent hasn't made a CLI call in 60 seconds, the presence chip
flips from "present" to "away." Nothing you do is blocked or lost while the agent is
away — annotations, marks, and findings queue durably and the agent catches up from its
last known cursor (`backbrief events --since N`) whenever it returns. A held
`events --follow` connection counts as present via a server-side heartbeat, so an agent
doesn't need to poll just to look alive.

**Repo moved.** A watcher polls `git rev-parse HEAD` and working-tree dirtiness every 2
seconds. When either changes, a `head_changed` event fires, the browser shows a banner
("repo moved: `a1b2c3` → `d4e5f6`"), and every citation currently visible on screen is
revalidated. `understood` decays to `visited` for exactly the files that actually
changed. **Practical tip:** if you (or a script) write scratch action/event JSON files
_inside_ the repo you're serving, those untracked files make the worktree "dirty" and
will trigger a `head_changed` themselves — write scratch files outside the repo (e.g.
under `/tmp`) to avoid noise.

**Drifted citation.** If a file changes after a citation to it was recorded, revalidation
(on `head_changed`, on session resume, or via `POST /api/revalidate`) re-checks the
stored content hash against the file's current content. If the exact same content moved
to a nearby location (within 200 lines), it's re-anchored automatically and rendered with
a visible drift badge:

```json
{
  "citation": { "path": "src/retry.js", "startLine": 2, "endLine": 2, "contentHash": "1e048f..." },
  "state": "drifted",
  "reason": "content moved from 1-1 to 2-2"
}
```

If the content is gone or the match isn't unique, it renders `broken` instead — flagged,
dashed, never silently dropped. **Note:** drift/broken detection is a property of
_revalidating an already-recorded citation_ against changed content; a single
`backbrief act` call always mints a citation's hash fresh from whatever the repo
currently contains, so it cannot itself observe drift against an older submitted hash in
the same call — drift only becomes visible on the next revalidation pass.

**Stale annotation.** The same relocation logic applies to annotations: if the exact
cited text moved, it's silently re-anchored; if it's ambiguous or gone, the annotation is
marked `stale` and surfaced in a triage panel — never deleted automatically. You resolve
it by re-posting the same annotation with a corrected citation, or by dismissing it
(`archived: true`).

## Troubleshooting

**"a backbrief server is already running for this repo."** `serve` refuses to start a
second server against a repo that already has a live one — it prints the existing
session's URL and pid instead of failing silently, so you can just hand that URL to
whoever needs it:

```
backbrief: a backbrief server is already running for this repo (pid 3007309, http://127.0.0.1:39577/?token=...)
```

If you actually want a fresh session, `backbrief stop` the old one first.

**Port already in use.** Passing a fixed `--port` that's taken (by anything, not just
another backbrief instance) fails fast rather than hanging:

```
backbrief: port 37437 is already in use — try random-port mode (omit --port)
```

The default (no `--port`) picks a free high port every time, which is the recommended
mode unless you have a specific reason to pin one.

**Stale server after a crash or reboot.** If the machine (or just the server process)
died uncommunicatively, `.backbrief/server.json` and `.backbrief/server.lock` can be left
behind pointing at a pid that no longer exists. Every command handles this the same way —
no hangs, no retries:

```bash
$ backbrief status
{"running":false}
$ backbrief act some-action.json
backbrief: no server running for this repo (run `backbrief serve` first)
```

Just run `backbrief serve` again — it detects the dead pid, cleans up the stale
artifacts, and starts a fresh server without any manual intervention.

**"no server running for this repo" right after `serve` looked like it worked.** Make
sure you're running `act`/`events`/`status`/`digest`/`stop` from inside the same repo (or
a subdirectory of it) that you passed to `--repo` — server discovery walks up from the
current directory looking for `.backbrief/server.json`, the same way `git` looks for
`.git`.
