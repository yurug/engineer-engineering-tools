# Command-line reference

The agent drives forebrief through eight commands. They are specified in
[`kb/spec/cli-contract.md`](../kb/spec/cli-contract.md), which is the authority if this page
and the code ever disagree.

The packages are unpublished, so invoke them as
`node packages/cli/dist/bin/forebrief.js <command>`, or run `npm link -w @forebrief/cli`
once to get `forebrief` on your `PATH`.

| Command                                                        | Does                                                                                                                                                    |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `forebrief serve [--repo DIR] [--title T] [--port N] [--open]` | Starts the server, prints `{url, token, port, sessionId, pid}`, daemonises. The URL carries the human token; the printed token is the agent credential. |
| `forebrief post FILE\|-`                                       | Posts a round of cards, atomically. Schema in `kb/spec/data-model.md`.                                                                                  |
| `forebrief act FILE\|-`                                        | Logs one record: a decision made in chat, a reconciliation, an answer.                                                                                  |
| `forebrief events [--since N] [--follow] [--timeout SECS]`     | Reads the log as JSONL.                                                                                                                                 |
| `forebrief status`                                             | Whether a server is running, and whether the round is closed.                                                                                           |
| `forebrief digest`                                             | Decisions, open provisionals, and pending questions, as markdown.                                                                                       |
| `forebrief fold --round ID \| --card ID [--out DIR]`           | Generates the knowledge-base fold-in markdown. The agent commits it.                                                                                    |
| `forebrief stop`                                               | Ends the session and shuts the server down.                                                                                                             |

## Exit codes

| Code | Meaning                                                   |
| ---- | --------------------------------------------------------- |
| 0    | Success                                                   |
| 2    | Success, but some citations were downgraded to conjecture |
| 1    | Error. The message names the next command to run.         |

## Ports

With no `--port`, `serve` rebinds the port this repository used last, recorded in
`.forebrief/last-port`, so the browser tab you kept open still works. If that port is taken
it falls back to an ephemeral one and warns on stderr. With `--port N` it binds that port or
fails with `E_PORT_IN_USE`.

The server binds `127.0.0.1` only.
