// Module: session/write-back -- the half of the bridge that makes understanding
// compound.
//
// Until this existed, inbrief READ the knowledge model and never wrote to it: a
// session taught you something and no future session knew. The compounding the
// product promises did not happen at all.
//
// The rules here are backbrief's, not inbrief's, and copying them is the point.
// Its `kb/spec/laconic-bridge.md` specifies the trigger, the state written, and
// the never-by-hand rule. Two tools writing the same store on different terms
// would make the store mean two things.
//
// @invariant P4 -- the write goes through laconic's own recording tool, never by
//   touching its files. That tool owns the schema, the index regeneration and
//   the commit; hand-writing would bypass all three.
// @invariant P3 -- fires only on a state the HUMAN claimed. Nothing here decides
//   the engineer understood something.
//
// WIRED, since ADR-035, to the one trigger that is not self-report: a contest the
// agent concedes. The paragraphs below are why it took this long, and they are
// still the reason the `demonstrated` path stays unwired.
//
// The original note read: NOT WIRED TO ANY TRIGGER YET, and the reason is a real
// constraint rather than unfinished work. laconic's own rule is that evidence is what the user DID: a
// correction, a question asked, unprompted correct use. It explicitly refuses
// self-reported expertise, which has no predictive power for understanding, and
// backbrief's evidence vocabulary keeps `self-report` distinct from `prediction`,
// `self-explanation` and `transfer` for the same reason.
//
// Every mastery control inbrief has today is a button: "I follow", "Not sure".
// That is self-report. Firing this on one would inject into the shared store
// exactly the evidence type laconic was built to keep out, and the store is what
// every subtraction depends on.
//
// So the mechanism is finished and correct, and what it needs is an interaction
// that produces evidence of a kind laconic accepts. The nearest candidate inbrief
// already half has is US5's rupture loop: an engineer who contests a claim and
// turns out to be RIGHT has done something, not claimed something.
//
// That is now the trigger, and it happened for real before it was built: the
// engineer contested a node teaching SSA, and lib/ir/ssa.ml said at line 57 that
// merge points use ordinary let-bindings, "not true SSA phis". They were right,
// the node was corrected, and the correction IS the concession (ADR-035).
import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { promisify } from "node:util";
import type { StoredNode } from "../types/node";

const execFileAsync = promisify(execFile);
const WRITE_TIMEOUT_MS = 10_000;

/**
 * What inbrief writes when a node is demonstrated.
 *
 * ALWAYS `familiar`, never `verified`, exactly as backbrief writes it. One
 * demonstrated instance is not laconic's bar for verified, which wants two
 * independent instances or one plus explicit confirmation. Writing the
 * conservative floor and letting laconic's own promotion ladder do the rest is
 * the honest move, and it is also the only way the two tools stay consistent
 * about what a single session proves.
 */
const WRITTEN_STATE = "familiar";

export interface WriteBackDeps {
  /** Absolute path to laconic's recording tool, or null when none was found. */
  recordCmd: string | null;
  /** Injected so a test never shells out for real. */
  run?: (cmd: string, args: string[]) => Promise<void>;
}

/**
 * Records that a session demonstrated a node's portable concept.
 *
 * @param node the node the engineer just claimed to have demonstrated
 * @param repoName the project's basename, for the evidence line
 * @returns whether anything was written
 * @invariant NEVER throws and never gates the session. A missing tool, a broken
 *   tool or a non-zero exit all mean "did not compound", which is a smaller
 *   failure than interrupting a human mid-session over a courtesy write.
 */
export async function writeBackDemonstrated(
  node: StoredNode,
  repoName: string,
  deps: WriteBackDeps,
): Promise<boolean> {
  return writeBack(
    node,
    `inbrief session (${repoName}): demonstrated understanding of ${node.question}`,
    deps,
  );
}

/**
 * Records that the engineer contested this claim and the agent conceded.
 *
 * @param node the node AS CORRECTED, since the correction is the concession
 * @returns whether anything was written
 * @invariant the evidence describes what the engineer DID, which is the whole
 *   reason this trigger exists and the `demonstrated` one above does not fire.
 *   Contesting a claim and being right is an observation; clicking "I follow" is
 *   a self-report, and laconic refuses those (ADR-035).
 * @invariant laconic's own ladder decides what the observation is worth. One
 *   observation moves a concept one step, so a single contest cannot reach
 *   `familiar` from nothing, and nothing here tries to.
 */
export async function writeBackConceded(
  node: StoredNode,
  repoName: string,
  deps: WriteBackDeps,
): Promise<boolean> {
  return writeBack(
    node,
    `inbrief session (${repoName}): contested the claim "${node.question}" and was right; ` +
      `the node was corrected rather than defended`,
    deps,
  );
}

async function writeBack(
  node: StoredNode,
  evidence: string,
  deps: WriteBackDeps,
): Promise<boolean> {
  // No portable concept means nothing that travels, so nothing to record. Most
  // nodes are repo-specific ground and this is the common case, not an edge one.
  if (!node.portableConcept || deps.recordCmd === null) return false;

  const args = [
    node.portableConcept.id,
    "--state",
    WRITTEN_STATE,
    "--domain",
    node.portableConcept.domain,
    "--evidence",
    evidence,
  ];

  try {
    await (deps.run ?? runTool)(deps.recordCmd, args);
    return true;
  } catch {
    return false; // swallowed by design, see the invariant above
  }
}

async function runTool(cmd: string, args: string[]): Promise<void> {
  // A .py file is run through python3; anything else is assumed executable.
  const isPython = cmd.endsWith(".py");
  await execFileAsync(isPython ? "python3" : cmd, isPython ? [cmd, ...args] : args, {
    timeout: WRITE_TIMEOUT_MS,
  });
}

/**
 * @returns the first laconic recording tool that exists, or null
 * @invariant the order is backbrief's, plus this machine's newer wrapper first.
 *   Both exist here, and a consumer that picked a different one would write
 *   through a different code path to the same store.
 */
export async function discoverRecordCmd(homedir: string): Promise<string | null> {
  const candidates = [
    process.env["LACONIC_RECORD_CMD"],
    path.join(homedir, ".laconic/bin/laconic-record"),
    path.join(homedir, "work/dev/laconic-skill/tools/laconic_record.py"),
  ].filter((c): c is string => c !== undefined);

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }
  return null;
}
