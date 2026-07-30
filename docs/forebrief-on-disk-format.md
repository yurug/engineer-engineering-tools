# On-disk format

Everything forebrief writes lives under `.forebrief/` in the host repository. The server
never writes outside it (property P3, enforced in `packages/server/src/fsguard.ts`). Folding
decisions into `kb/` is a separate, agent-authored, lint-gated commit.

## What is tracked, what is not

| Path                            | Tracked | What it is                                                                                          |
| ------------------------------- | ------- | --------------------------------------------------------------------------------------------------- |
| `.forebrief/decisions.jsonl`    | yes     | The append-only decision log. Records are never rewritten; a late answer appends a reconciliation.  |
| `.forebrief/config.json`        | yes     | Repository configuration: `title`, and `foldIn` with `adrDir`, `roundsDir`, `template`, `idFormat`. |
| `.forebrief/rounds/<ulid>.json` | yes     | Each posted round of cards, as posted.                                                              |
| `.forebrief/digest.md`          | yes     | The rendered digest.                                                                                |
| `.forebrief/server.json`        | no      | Live server discovery, including tokens.                                                            |
| `.forebrief/server.lock`        | no      | The single-instance lock.                                                                           |
| `.forebrief/server.log`         | no      | Server log.                                                                                         |
| `.forebrief/.serve-error.json`  | no      | Last startup failure, for a readable error.                                                         |
| `.forebrief/last-port`          | no      | The port to rebind next time.                                                                       |

The nested `.forebrief/.gitignore` is written by `serve` on first run and covers the runtime
files above.

The full schema, including the fold-in formats, is in
[`kb/spec/config-and-formats.md`](../kb/spec/config-and-formats.md).

## Why the log is tracked

The decision log is the product. A decision that only exists in a chat scroll cannot be
cited six months later when someone asks why the system is like this, and it cannot be
folded into a knowledge base an agent reads. Keeping it in git means the reasoning travels
with the code and diffs like anything else.
