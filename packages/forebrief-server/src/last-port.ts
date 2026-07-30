// Module: last-port -- ADR-006 (kb/architecture/decisions/ADR-006-recovery-
// rebinds-last-port.md): "serve rebinds the repo's last-used port on
// recovery." `.forebrief/last-port` is RUNTIME state (bootstrap.ts's
// `.gitignore` list, kb/spec/config-and-formats.md's layout table) -- not
// git-tracked, unlike decisions.jsonl/rounds/digest.md.
//
// Read (server.ts, before binding) only when `serve` was given no explicit
// `--port`; written after EVERY successful bind (explicit, preferred, or
// plain-ephemeral alike), so the NEXT --port-less `serve` always has the
// most recent port on record to try.
import * as fs from "node:fs/promises";
import { resolveForebriefPath } from "./fsguard";

const LAST_PORT_RELATIVE_PATH = "last-port";

/**
 * @returns the persisted port, or null if none is on record (first run, or
 *   an unreadable/malformed file) -- never throws, since "no last-used
 *   port yet" is the ordinary first-serve case, not an error.
 */
export async function readLastPort(repoRoot: string): Promise<number | null> {
  try {
    const raw = await fs.readFile(resolveForebriefPath(repoRoot, LAST_PORT_RELATIVE_PATH), "utf8");
    const port = Number(raw.trim());
    return Number.isInteger(port) && port > 0 ? port : null;
  } catch {
    return null;
  }
}

/**
 * @invariant P3: written through `resolveForebriefPath`, like every other
 *   `.forebrief/` write this package makes.
 * Best-effort -- a failed write must never fail `serve` itself (mirrors
 * `bootstrap.ts`'s own posture); it only means the NEXT serve falls back to
 * an ephemeral port instead of rebinding.
 */
export async function writeLastPort(repoRoot: string, port: number): Promise<void> {
  try {
    await fs.writeFile(
      resolveForebriefPath(repoRoot, LAST_PORT_RELATIVE_PATH),
      `${String(port)}\n`,
      "utf8",
    );
  } catch {
    // best-effort, as documented above
  }
}
