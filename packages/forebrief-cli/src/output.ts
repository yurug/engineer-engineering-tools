// Module: output -- the CLI's stdout/stderr contract.
//
// kb/spec/cli-contract.md: machine-readable stdout (JSON/JSONL only),
// human messages on stderr, exit codes 0/1/2 (kb/conventions/error-
// handling.md). Every command writes through these two functions rather
// than calling `console.log`/`process.stdout.write` directly, so the
// contract is enforced in one place and commands stay testable (inject a
// fake `Io` instead of asserting against real streams).
export const EXIT_OK = 0;
export const EXIT_ERROR = 1;
/** "flagged/partial" -- kb/spec/cli-contract.md: `post`'s success-but-degraded signal (step 2+). */
export const EXIT_FLAGGED = 2;

export interface Io {
  /** One line of machine-readable output (JSON or JSONL) -- a trailing "\n" is added. */
  writeOut(line: string): void;
  /** One line of human-facing text -- always stderr, per the CLI contract. */
  writeErr(line: string): void;
}

/** Production Io -- writes to the real process streams. */
export const processIo: Io = {
  writeOut: (line) => process.stdout.write(line + "\n"),
  writeErr: (line) => process.stderr.write(line + "\n"),
};
