# Forebrief command-line reference

The agent drives forebrief through eight commands. After installing the public
toolsuite, invoke them as `forebrief <command>`.

## Enable forebrief in a repository

Create the tracked file `.forebrief/config.json` before invoking an agent workflow:

```json
{
  "title": "My project decisions",
  "foldIn": {
    "adrDir": "kb/architecture/decisions",
    "roundsDir": "kb",
    "template": "default",
    "idFormat": "ADR-%03d"
  }
}
```

Adjust the two directories to the repository's KB layout. `forebrief serve`
creates runtime files and their nested `.gitignore`, but deliberately does not
invent fold-in destinations. The agent skill considers forebrief enabled only
when both the binary and this config file exist.

| Command | Does |
|---|---|
| `forebrief serve [--repo DIR] [--title T] [--port N] [--open]` | Starts the server, prints `{url, token, port, sessionId, pid}`, daemonises. The URL carries the human token; the printed token is the agent credential. |
| `forebrief post FILE\|-` | Posts a round of cards atomically. |
| `forebrief act FILE\|-` | Logs one decision, reconciliation, or answer. |
| `forebrief events [--since N] [--follow] [--timeout SECS] [--actor human]` | Reads the log as JSONL; timed follow exits on its first matching event. |
| `forebrief status` | Reports whether a server is running and whether the round is closed. |
| `forebrief digest` | Prints decisions, open provisionals, and pending questions as Markdown. |
| `forebrief fold --round ID \| --card ID [--out DIR]` | Generates knowledge-base fold-in Markdown for the agent to commit. |
| `forebrief stop` | Ends the session and shuts the server down. |

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Success |
| 2 | Success, but some citations were downgraded to conjecture |
| 1 | Error; the message names the next command to run |

## Ports

With no `--port`, `serve` rebinds the port this repository used last, recorded
in `.forebrief/last-port`. If that port is taken, it falls back to an ephemeral
one and warns on stderr. With `--port N`, it binds that port or fails with
`E_PORT_IN_USE`. The server binds `127.0.0.1` only.
