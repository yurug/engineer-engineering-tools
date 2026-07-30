// Module: index -- @forebrief/cli's public surface, mainly for tests.
//
// The real entry point is `bin/forebrief.ts` (the npm `bin` target); this
// barrel exists so integration tests can call each command function
// directly with an injected `Io` instead of spawning a child process for
// every scenario (child-process spawns are reserved for the tests that
// specifically prove daemonization behavior).
export { runServeCommand, type ServeOptions, type ServeDeps } from "./commands/serve";
export { runStatusCommand, type StatusOptions } from "./commands/status";
export { runStopCommand, type StopOptions } from "./commands/stop";
export { runPostCommand, type PostOptions } from "./commands/post";
export { runActCommand, type ActOptions } from "./commands/act";
export { runEventsCommand, type EventsOptions } from "./commands/events";
export { runDigestCommand, type DigestOptions } from "./commands/digest";
export { runFoldCommand, type FoldOptions } from "./commands/fold";
export { EXIT_OK, EXIT_ERROR, EXIT_FLAGGED, type Io } from "./output";
export { findLiveServer } from "./discovery";
