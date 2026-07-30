// Module: index -- @backbrief/server's public surface.
//
// `cli` and integration tests import `startServer`/`ServerHandle` from
// here; nothing else in this package is meant to be imported directly from
// outside (architecture/overview.md's dependency-direction rule).
export { startServer, type ServerHandle, type StartServerOptions } from "./server";
export { readServerJson, type ServerInfo } from "./store/discovery";
export { isPidAlive } from "./store/lock";
export { resolveRepoRoot } from "./repo";
