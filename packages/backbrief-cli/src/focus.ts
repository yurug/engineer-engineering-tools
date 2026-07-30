// Module: focus -- parses `serve --focus diff:FROM..TO|component:PATH`
// (api-contracts.md#cli) into a shared `Focus` value.
//
// Split out of bin/daemon-entry.ts (step 4, kb/plan.md) so it is directly
// unit-testable: every file under `bin/` self-executes on import (`void
// main()` at its own bottom -- matches bin/backbrief.ts's identical
// pattern), which makes importing one from a test run its whole process
// entrypoint as a side effect. Plain, non-`bin/` modules like this one
// (and ../args.ts) carry no such side effect, so a test can import just the
// parsing logic.
import type { Focus } from "@backbrief/shared";

/**
 * @param raw the raw `--focus` flag value
 * @returns the parsed Focus
 * @throws {Error} if `raw` matches none of the three recognized forms
 */
export function parseFocus(raw: string): Focus {
  if (raw === "system") return { kind: "system" };
  if (raw.startsWith("component:"))
    return { kind: "component", path: raw.slice("component:".length) };
  if (raw.startsWith("diff:")) {
    const [from, to] = raw.slice("diff:".length).split("..");
    return { kind: "diff", from: from ?? "HEAD", to: to ?? "worktree" };
  }
  throw new Error(`unrecognized --focus value: ${raw}`);
}
