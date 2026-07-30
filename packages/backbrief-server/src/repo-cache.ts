// Module: repo-cache -- re-exports @brief/core's generic rev-read
// memoization (ADR-001). `RepoAccess` (this package's fuller interface)
// satisfies core's narrower `CitationRepoAccess` structurally, so every
// existing call site (`memoizeRevReads(deps.repo)`) needs no change.
export { memoizeRevReads } from "@brief/core";
