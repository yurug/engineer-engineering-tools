// Module: fold/templates -- forebrief's own vendored copy of the
// agentic-dev-kit's default fold templates (kb/spec/config-and-formats.md:
// "default template ships in the agentic-dev-kit under `templates/
// forebrief/`").
//
// WHY a vendored copy instead of reading the kit repo at fold time (a
// genuine design decision -- dogfooded, this repo's own decisions.jsonl,
// card `step4-fold-template-vendoring`): NF6 requires forebrief to run on
// repos with no other dependency present, and `template:"default"` must
// resolve on every machine forebrief is installed on, not only the one
// developer machine where forebrief and agentic-dev-kit happen to be
// sibling checkouts. "default" is therefore a NAME forebrief's own code
// resolves, not a filesystem lookup into another repo -- the same posture
// @forebrief/cli already takes with @brief/core (a BUILD-time sibling
// dependency, never a runtime one). The kit's copy under `templates/
// forebrief/` is the human-editable, canonical AUTHORING location; this
// file must be kept byte-identical to it by hand until the two repos share
// a publishing pipeline.
export const DEFAULT_ROUND_DIGEST_TEMPLATE = `---
id: {{id}}
type: decision
summary: {{summary}}
domain: {{domain}}
tags: [record, fold-in]
last-updated: {{date}}
forebrief-record: {{record_ids}}
---
# {{title}}

Folded from forebrief round \`{{round_id}}\` (posted {{posted_at}}) via
\`forebrief fold\`. Every card below shows its CURRENT record (the
highest-seq decision or reconciliation -- forebrief's append-only
resolution rule, P5) with its full rationale history and ask-why thread
verbatim.

{{cards}}
## Related files

- \`.forebrief/decisions.jsonl\` -- the source-of-truth log this digest was
  folded from; every \`seq\` referenced above resolves there.
`;

export const DEFAULT_ADR_TEMPLATE = `---
id: {{id}}
type: decision
summary: {{summary}}
domain: {{domain}}
tags: [record, fold-in]
last-updated: {{date}}
forebrief-record: {{record_id}}
---
# {{adr_number}} — {{title}}

## Context

{{context}}

## Decision

{{decision}}

## Consequences

{{consequences}}

## Alternatives considered

{{alternatives}}

## Rationale exchange

{{rationale_exchange}}

## What this does not cover

{{not_covered}}
`;
