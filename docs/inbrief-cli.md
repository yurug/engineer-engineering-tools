# Inbrief command-line reference

Inbrief opens a grounded onboarding session for an engineer. The coding agent
builds a question map from repository evidence; the engineer alone records
mastery in the browser.

After installing the public toolsuite, invoke commands as `inbrief …`.

| Command                                          | Does                                                                                                           |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `inbrief serve [--repo DIR] [--port N] [--open]` | Starts a local session and prints its URL, tokens, port, session id, and PID.                                  |
| `inbrief act FILE.json` / `inbrief act -`        | Posts an agent-authored node, agenda, answer, concession, finding, or close record.                            |
| `inbrief status`                                 | Reports whether the server is running and the current coverage counts.                                         |
| `inbrief propose [--out DIR]`                    | Prints durable material learned by the session, or writes proposals to an explicitly chosen scratch directory. |
| `inbrief stop`                                   | Stops the server without claiming that the onboarding session was completed.                                   |

The server binds only to `127.0.0.1`. Runtime discovery and credentials live
under `.inbrief/`; the nested `.gitignore` excludes them.

## Payloads accepted by `act`

Every payload carries a `kind`. Citation paths are repository-relative and line
numbers are one-based and inclusive. Omit revisions and hashes: the server
mints and validates them.

```json
{
  "kind": "node",
  "node": {
    "id": "append-only-recovery",
    "mode": "explanation",
    "question": "How does restart recovery work?",
    "answer": "The log is replayed in order; a torn final record is ignored.",
    "citations": [{ "kind": "code", "path": "src/log.ts", "startLine": 20, "endLine": 45 }],
    "requires": [],
    "lifetime": "durable"
  }
}
```

Node questions are limited to 12 words and answers to 60. `mode` is `tutorial`
or `explanation`; `lifetime` is `durable` or `snapshot` and defaults to the
safer `snapshot`. Every node needs at least one resolving citation.

Other accepted shapes:

```json
{"kind":"agenda","agenda":["append-only-recovery"],"intent":"Understand recovery before changing the scheduler"}
{"kind":"answer","question":12,"by":"reply","text":"The malformed suffix is reported and skipped."}
{"kind":"concession","node":"append-only-recovery"}
{"kind":"finding","text":"Recovery accepts an invalid checksum.","citation":{"kind":"code","path":"src/log.ts","startLine":31,"endLine":34}}
{"kind":"close"}
```

`answer.by` is `node`, `reply`, or `gap`. A concession is valid only after the
engineer contested that node. Mastery and engineer questions are intentionally
absent from the CLI because only the browser carries the human credential.

## Safe write-back

`inbrief propose` writes nothing by default. With `--out`, it writes only into
the named directory. Review those files and move selected durable material into
the project as an ordinary commit; a session must never silently author project
documentation.
