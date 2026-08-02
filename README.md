# engineer-engineering-tools

Three tools for steering agentic development, and the library they share.

Every loop in agentic development assumes an engineer who can steer it, and steering
needs a mental model. These are for building that model, deciding with it, and keeping
it current as agents change the code underneath you.

| Tool | Moment | Question it answers |
|---|---|---|
| **inbrief** | Before work starts | What is this, and what do I need to hold to steer it? |
| **forebrief** | At every decision | What are we deciding, and why? |
| **backbrief** | After a change lands | What just changed that I have not integrated? |

Each runs as a local server with a browser UI, driven by a coding agent through a CLI.
Every claim any of them makes cites validated evidence from your code or knowledge base,
and a claim that cannot be validated is marked as conjecture rather than presented as
fact.

## Install

```sh
git clone https://github.com/yurug/engineer-engineering-tools
cd engineer-engineering-tools
./install.sh
```

That builds everything, puts `backbrief`, `forebrief` and `inbrief` on your `PATH`, and
installs the Claude skills that ship with the tools. Everything on is the default because
the tools are designed to be used together; `./install.sh forebrief` installs one.

Requires Node >= 20. If the binaries do not land on your `PATH`, check that
`npm config get prefix` names a directory that is on it.

### Strongly recommended: install Laconic

[Laconic](https://github.com/yurug/laconic-skill) supplies the persistent,
project-independent model of what you already understand. Inbrief and Backbrief work
without it, but they cannot carry demonstrated knowledge between projects or calibrate
their explanations against that history.

Install it as a Claude Code plugin for the complete, always-on integration:

```text
/plugin marketplace add https://github.com/yurug/laconic-skill
/plugin install laconic@nomadic-labs
```

After starting a new Claude Code session, verify it with
`~/.laconic/bin/laconic-status`. A bare-skill installation is also supported; see
Laconic's README for the distinction.

## What is here

| Package | What it is |
|---|---|
| `@brief/shared` | wire schemas and citation hashing — the shapes that cross the JSON boundary |
| `@brief/core` | event store and log codec, auth, filesystem guard, discovery, citation minting and validation, the daemon mechanism |
| `@brief/primitives` | validated-spec-to-visual renderers: diagram, filmstrip, chart, trade-off matrix, assertion-evidence card |
| `@backbrief/*`, `@forebrief/*`, `@inbrief/*` | each tool's server, browser UI and CLI |

An agent emits a JSON spec; the library validates it and renders. Never markup, never
drawing code — which is what makes "the agent cannot smuggle a claim past validation" a
property rather than a hope.

## This repository is generated

It is a distribution. Development happens in separate private repositories, and this tree
is assembled from them by a publish script. Two consequences worth knowing:

- **Pull requests here cannot be merged as-is** — a change has to land in the private
  repo it came from, or the next publish will overwrite it. Issues are welcome and are
  the right way to report anything.
- **There is no history to read.** Design records, decision logs and architecture notes
  stay private, which is deliberate: they carry unfinished thinking, rejected options and
  known-unfixed bugs, and publishing that alongside a tool misrepresents both.

## Docs

`docs/` carries the user-facing reference for each tool's CLI and, for backbrief, a user
manual. Anything not there is not yet written down.

## License

See `LICENSE`.
