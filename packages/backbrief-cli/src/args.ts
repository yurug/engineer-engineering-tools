// Module: args -- a hand-rolled `--flag value` / `--flag` argv reader.
//
// ADR-004 names no CLI-argument-parsing dependency, and the surface here is
// tiny (kb/spec/api-contracts.md#cli lists at most 5 flags across 6
// commands) -- adding `commander`/`yargs` would be scope creep against
// "Dependencies beyond the named set require updating external/INDEX.md
// first" for a handful of `indexOf` calls.
export function extractFlag(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}

export function hasFlag(argv: readonly string[], name: string): boolean {
  return argv.includes(name);
}
