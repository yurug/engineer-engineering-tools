// Module: commands/propose -- `inbrief propose [--out DIR]`.
//
// What a session learned, rendered as the files a project keeps its teaching
// material in. This is the agent-facing half of ADR-004's "material persists":
// a session teaches something the project did not carry, and this is how it gets
// carried next time.
//
// @invariant P4 -- with no --out this writes NOTHING, printing to stdout. With
//   --out it writes to a directory the caller named, never into the project's
//   documentation on its own initiative. The agent commits, the engineer reviews
//   a diff, and nothing appears in a repository because a session happened.
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { connect, apiBase } from "../discovery";
import { EXIT_ERROR, EXIT_OK, type Io } from "../output";

export interface ProposeOptions {
  repoStartDir: string;
  /** Where to write. Omit to print, which is the default for a reason. */
  out?: string;
  io: Io;
}

interface Proposal {
  path: string;
  content: string;
}

export async function runProposeCommand(opts: ProposeOptions): Promise<number> {
  const found = await connect(opts.repoStartDir);
  if (!found.ok) {
    opts.io.writeErr(`inbrief: ${found.reason}`);
    return EXIT_ERROR;
  }
  const { info } = found.connection;
  const res = await fetch(`${apiBase(info)}/api/proposals`, {
    headers: { Authorization: `Bearer ${info.token}` },
  });
  if (!res.ok) {
    opts.io.writeErr(`inbrief: /api/proposals answered ${String(res.status)}`);
    return EXIT_ERROR;
  }
  const { proposals } = (await res.json()) as { proposals: Proposal[] };

  if (proposals.length === 0) {
    // Not an error: a session that taught only what the project already carried
    // has nothing to add, which is the good case as material accumulates.
    opts.io.writeErr("inbrief: nothing learned that the project does not already carry");
    return EXIT_OK;
  }

  if (opts.out === undefined) {
    // Printing, not writing, is the default: the caller has to choose to put
    // these anywhere, which is what makes P4's boundary visible at the CLI.
    for (const proposal of proposals) {
      opts.io.writeOut(JSON.stringify({ path: proposal.path, content: proposal.content }));
    }
    return EXIT_OK;
  }

  const outDir = path.resolve(opts.out);
  for (const proposal of proposals) {
    const target = path.join(outDir, path.basename(proposal.path));
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, proposal.content, "utf8");
    opts.io.writeOut(JSON.stringify({ wrote: target, suggestedPath: proposal.path }));
  }
  return EXIT_OK;
}
