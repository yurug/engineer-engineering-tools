// Module: args -- a hand-rolled `--flag value` / `--flag` argv reader.
//
// Mirrors @backbrief/cli's own args.ts -- the surface here is tiny
// (kb/spec/cli-contract.md lists at most 4 flags across 3 commands at plan
// step 1), so a dependency like `commander`/`yargs` would be scope creep
// for a handful of `indexOf` calls.
export function extractFlag(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}

export function hasFlag(argv: readonly string[], name: string): boolean {
  return argv.includes(name);
}
