// Module: args -- flag parsing, kept deliberately small.
//
// No dependency: the surface is four commands and four flags, and a parser
// library would be more code than the thing it parses. Anything unrecognized is
// reported rather than ignored, because a silently dropped flag is how a user
// ends up believing they passed --port.
export interface Parsed {
  command: string | undefined;
  flags: Map<string, string | true>;
  positional: string[];
}

export function parseArgv(argv: readonly string[]): Parsed {
  const flags = new Map<string, string | true>();
  const positional: string[] = [];
  let command: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;
    if (!token.startsWith("--")) {
      if (command === undefined) command = token;
      else positional.push(token);
      continue;
    }
    const name = token.slice(2);
    const next = argv[i + 1];
    // A flag whose next token is another flag (or absent) is boolean; this is
    // what lets `--open` and `--repo DIR` share one loop.
    if (next === undefined || next.startsWith("--")) flags.set(name, true);
    else {
      flags.set(name, next);
      i++;
    }
  }
  return { command, flags, positional };
}

/** @returns the flag as a string, or undefined when absent or given as a bare boolean. */
export function stringFlag(parsed: Parsed, name: string): string | undefined {
  const value = parsed.flags.get(name);
  return typeof value === "string" ? value : undefined;
}

/** @returns the parsed number, or undefined; a non-numeric value is caller-reported, never silently 0. */
export function numberFlag(parsed: Parsed, name: string): number | undefined {
  const raw = stringFlag(parsed, name);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}
