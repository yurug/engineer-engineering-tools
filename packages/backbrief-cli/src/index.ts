// Module: index -- @backbrief/cli's public surface, mainly for tests.
//
// The real entry point users/agents invoke is `bin/backbrief.ts` (the npm
// `bin` target); this barrel exists so integration tests can call each
// command function directly with an injected `Io` instead of spawning a
// child process for every scenario (child-process spawns are reserved for
// the tests that specifically prove daemonization/--follow behavior).
export { runServeCommand, type ServeOptions, type ServeDeps } from "./commands/serve";
export { runActCommand } from "./commands/act";
export { runEventsCommand, type EventsOptions } from "./commands/events";
export { runStatusCommand } from "./commands/status";
export { runDigestCommand } from "./commands/digest";
export { runStopCommand } from "./commands/stop";
export { EXIT_OK, EXIT_ERROR, EXIT_FLAGGED, type Io } from "./output";
export { findLiveServer } from "./discovery";
