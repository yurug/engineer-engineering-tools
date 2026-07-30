// Module: ports -- dependency-injection interfaces for effectful primitives.
//
// kb/conventions/code-style.md: "Effects (fs, git, clock, randomness/ULIDs,
// network) enter through interfaces defined in `shared` and are passed
// explicitly (constructor/params) -- no module Singletons." This file is
// those interfaces for the two effects `shared` itself needs to name
// (clock, id generation); fs/git-specific ports live in `server` alongside
// the modules that are the sole legitimate importers of `fs`/`child_process`
// (server/src/fsguard, server/src/repo -- see architecture/overview.md's
// trust-boundary section).

/** Injectable wall-clock -- lets tests freeze/advance time deterministically. */
export interface Clock {
  /** @returns the current instant as an ISO-8601 string (Envelope.ts, Session.createdAt, ...). */
  nowIso(): string;
}

/** Injectable ID generator -- lets tests produce deterministic, sortable ids. */
export interface IdGenerator {
  /** @returns a new ULID (config-and-formats.md: "IDs: ULIDs everywhere"). */
  next(): string;
}
