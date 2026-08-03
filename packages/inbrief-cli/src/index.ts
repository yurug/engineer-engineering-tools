// Module: index -- the CLI's public surface, so bin/ stays a thin shell.
export { runServeCommand, type ServeOptions } from "./commands/serve";
export { runActCommand, type ActOptions } from "./commands/act";
export { runStatusCommand, type StatusOptions } from "./commands/status";
export { runStopCommand, type StopOptions } from "./commands/stop";
export { runProposeCommand, type ProposeOptions } from "./commands/propose";
export { runEventsCommand, type EventsOptions } from "./commands/events";
export { parseArgv, stringFlag, numberFlag, type Parsed } from "./args";
export { processIo, EXIT_OK, EXIT_ERROR, type Io } from "./output";
export { connect, apiBase, type Connection } from "./discovery";
