// Module: mint -- re-exports @brief/core's citation minting (ADR-001,
// "our P1/P10 machinery, whole"). `RepoAccess` (this package's fuller
// interface) satisfies core's narrower `CitationRepoAccess` structurally,
// so every existing call site (`makeCitationMinter(deps.repo)`) needs no change.
export { makeCitationMinter, assertMinted } from "@brief/core";
