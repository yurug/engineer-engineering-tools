// Module: output -- the CLI's stdout/stderr contract, in one place.
//
// Machine-readable output on stdout (JSON only), human messages on stderr.
// Commands write through this seam rather than calling console.log, so the
// contract is enforced once and a test can inject a fake instead of asserting
// against real process streams.
export const EXIT_OK = 0;
export const EXIT_ERROR = 1;

export interface Io {
  /** One line of machine-readable output; the newline is added here. */
  writeOut(line: string): void;
  /** One line of human-facing text. Always stderr, so stdout stays parseable. */
  writeErr(line: string): void;
}

export const processIo: Io = {
  writeOut: (line) => process.stdout.write(line + "\n"),
  writeErr: (line) => process.stderr.write(line + "\n"),
};
