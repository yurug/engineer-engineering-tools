# Command-line reference

The agent-side surface is six commands. All of them are thin HTTP clients: they discover the
running server through `.backbrief/server.json` and carry the agent token.

After installing the public toolsuite, invoke commands as `backbrief …`.

| Command                                                                                                        | Does                                                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backbrief serve [--repo DIR] [--focus diff:FROM..TO\|component:PATH\|system] [--title T] [--port N] [--open]` | Starts a session; prints `{url, token, port, sessionId, pid}` then daemonises.                                                                                                                     |
| `backbrief act FILE.json` / `backbrief act -`                                                                  | Posts one action (a move, a card, a diagram) or an agent-postable event (`answer`, `open_finding`/`resolve_finding`, `kb_proposal`/`resolve_proposal`), and prints the citation validation report. |
| `backbrief events [--since N] [--follow] [--timeout SECS] [--actor human]`                                     | Prints the event log as JSONL; a timed follow exits on its first matching envelope. This is the agent's inbound channel.                                                                           |
| `backbrief status`                                                                                             | `{running, sessionId, url, agentSeen, humanSeen}`, or `{running:false}`.                                                                                                                           |
| `backbrief digest`                                                                                             | The cross-session state digest, in markdown: coverage, open questions and findings, recently understood ground.                                                                                    |
| `backbrief stop`                                                                                               | Ends the session, flushes the digest, shuts the server down.                                                                                                                                       |

## Exit codes for `act`

| Code | Meaning                                                             |
| ---- | ------------------------------------------------------------------- |
| 0    | Every citation validated                                            |
| 2    | The action was posted, but some citations are flagged as unverified |
| 1    | Error: malformed action, no running server, transport failure       |

Exit code 2 is not a failure to post. The content renders, visibly flagged. Treat it as a
signal that the map cites something that has moved.

## The event stream

`backbrief events --follow` run as a background process is the agent's live signal: stdout
streams one JSON envelope per line the instant the human annotates, marks something
understood, contests it, or opens a finding. The agent reacts with `backbrief act`.

On a runtime that only wakes a background process when it exits, rather than per output
line, loop instead:

```bash
backbrief events --actor human --since <lastCommittedSeq> --follow --timeout 20
```

This exits after twenty seconds, or immediately on the first event, whichever comes first.
The chunked-follow fallback is useful because some agent runtimes only deliver a
background process's output after that process exits.

## Session scope

`--focus` decides what the comprehension map covers:

- `diff:main..HEAD` scopes the session to what changed between two revisions, which is the
  usual per-cycle checkpoint.
- `component:path/to/dir` scopes it to one part of the tree, for onboarding onto a
  subsystem.
- `system` covers the repository as a whole, which is only useful on small ones.
