// Module: laconic/write -- the ONLY code path that invokes
// laconic_record.py, backbrief's single sanctioned write outside
// `.backbrief/` (kb/spec/laconic-bridge.md#the-boundary; P3 untouched --
// P3 forbids writes to the HOST REPO, and this never touches it).
//
// Safety (laconic-bridge.md, non-negotiable):
// - argv array, never a shell string -- `execFile`, never `exec`/a shell,
//   so evidence/question/id/domain text (agent/node-controlled) travels as
//   discrete argv elements with no shell metacharacter interpretation.
// - always `--state familiar`, never `verified` -- the write's honest,
//   conservative floor; laconic's own promotion ladder decides `verified`.
// - fire-and-forget: `invokeLaconicRecord` returns `void`, not a Promise,
//   so there is nothing for a caller to accidentally await onto the
//   critical path. A bounded `timeout` kills a hung process; every error
//   (spawn failure, non-zero exit, timeout) is caught INSIDE this module
//   and only logged.
import { execFile } from "node:child_process";

export interface LaconicRecordParams {
  conceptId: string;
  domain: string;
  evidence: string;
  /** ISO date, YYYY-MM-DD (laconic_record.py's --date). */
  date: string;
}

/**
 * Runs a subprocess, callback-style, matching `node:child_process.execFile`'s
 * shape -- injectable so tests assert the exact argv without spawning
 * python3 for real (code-style.md's DI rule: effects enter through an
 * interface, passed explicitly).
 */
export type ProcessRunner = (
  command: string,
  args: readonly string[],
  options: { timeout: number },
  callback: (error: Error | null, stdout: string, stderr: string) => void,
) => void;

const RECORD_TIMEOUT_MS = 5_000;

/**
 * @param recordCmd absolute path to laconic_record.py, resolved by
 *   discover-record-cmd.ts -- never a user- or agent-controlled value
 * @param params the concept id/domain/evidence/date. `evidence` embeds the
 *   node's `question` text, which IS agent-controlled prose -- exactly why
 *   every field travels as a separate `buildRecordArgv` array element,
 *   never concatenated into a shell string.
 * @invariant never throws; never returns a value a caller could await onto
 *   the critical path (module header)
 */
export function invokeLaconicRecord(
  recordCmd: string,
  params: LaconicRecordParams,
  runProcess: ProcessRunner = execFile,
): void {
  const argv = buildRecordArgv(recordCmd, params);
  try {
    runProcess("python3", argv, { timeout: RECORD_TIMEOUT_MS }, (error, _stdout, stderr) => {
      if (error) {
        // Swallowed by design (laconic-bridge.md#failure-honesty): "a write
        // that errors -> logged, swallowed; the session is unaffected."
        // stderr included so a human tailing server logs can still diagnose it.
        console.error(
          `[laconic-bridge] write-back failed for ${params.conceptId}:`,
          error.message,
          stderr,
        );
      }
    });
  } catch (error) {
    // A synchronous throw from `runProcess` itself (a hostile/broken fake
    // in tests, or a platform that rejects the spawn immediately) gets the
    // same swallow-and-log treatment -- nothing here may escape to the caller.
    console.error(`[laconic-bridge] write-back could not start for ${params.conceptId}:`, error);
  }
}

/**
 * @returns the argv array for `python3 <recordCmd> <conceptId> --state
 *   familiar --domain <domain> --evidence <evidence> --date <date>` --
 *   ALWAYS `familiar` (laconic-bridge.md: "Always familiar, never verified").
 * @invariant every dynamic value (recordCmd, conceptId, domain, evidence,
 *   date) is its OWN array element -- there is no string concatenation
 *   anywhere in this function, so shell metacharacters in agent/node-
 *   controlled text (evidence, conceptId) have nothing to inject into: the
 *   OS argv boundary is the safety, not escaping.
 */
export function buildRecordArgv(recordCmd: string, params: LaconicRecordParams): string[] {
  return [
    recordCmd,
    params.conceptId,
    "--state",
    "familiar",
    "--domain",
    params.domain,
    "--evidence",
    params.evidence,
    "--date",
    params.date,
  ];
}
