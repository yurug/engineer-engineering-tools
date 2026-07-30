// Module: laconic/bridge-write-hook -- builds the write-back trigger
// server.ts wires into its `projectEnvelope` chokepoint.
//
// Implements kb/spec/laconic-bridge.md#write end to end. `recordCmd` is
// resolved ONCE, here, at server startup (`buildLaconicWriteHook` is async
// -- the only I/O in this whole flow) -- the returned hook itself is a
// plain SYNCHRONOUS function so calling it on the hot request path never
// adds an await. shared's `detectNewlyDemonstrated` (pure) finds the
// transition; this module adds the two things that make it a
// laconic-bridge write specifically: filtering to nodes carrying
// `portableConcept` (laconic-bridge.md: "NEVER on repo-specific nodes"),
// and building the evidence sentence the spec's exact template describes.
import type { Envelope, MapNode, OverlayEntry } from "@backbrief/shared";
import { detectNewlyDemonstrated } from "@backbrief/shared";
import * as path from "node:path";
import type { Config } from "../store/config";
import type { ModelSnapshot } from "../store/model-store";
import { discoverLaconicRecordCmd } from "./discover-record-cmd";
import { isLaconicExplicitlyDisabled, type LaconicEnv } from "./home";
import { invokeLaconicRecord, type ProcessRunner } from "./write";

/**
 * Called once per node_response/move_response envelope (the only two
 * envelope types overlay-fold.ts's applyNodeResponse/applyMoveResponse can
 * ever move a node INTO `demonstrated` from -- P11) with the overlay
 * snapshots from just before and just after THAT ONE envelope folded in,
 * plus the map's current nodes (for the `portableConcept` lookup).
 */
export type LaconicWriteHook = (
  overlayBefore: readonly OverlayEntry[],
  overlayAfter: readonly OverlayEntry[],
  nodes: readonly MapNode[],
) => void;

/**
 * @param homedir the caller's `os.homedir()` (DI, home.ts's module header)
 * @param clockNowIso the session clock's `nowIso` (DI, code-style.md) --
 *   called at WRITE time (inside the returned hook), not here, so the date
 *   in each write reflects when the transition actually happened
 * @returns `null` if the bridge is explicitly disabled OR no `recordCmd`
 *   resolves (laconic-bridge.md: "if recordCmd can't be resolved...
 *   WRITE no-ops") -- server.ts skips the before/after overlay snapshot
 *   dance entirely when this is `null`, so a repo with no laconic write
 *   path pays zero per-envelope cost for it.
 */
export async function buildLaconicWriteHook(
  config: Config,
  env: LaconicEnv,
  homedir: string,
  repoRoot: string,
  clockNowIso: () => string,
  runProcess?: ProcessRunner,
): Promise<LaconicWriteHook | null> {
  if (isLaconicExplicitlyDisabled(config)) return null;
  const recordCmd = await discoverLaconicRecordCmd(config, env, homedir);
  if (!recordCmd) return null;

  const repoBasename = path.basename(repoRoot);
  return (overlayBefore, overlayAfter, nodes) => {
    const newlyDemonstrated = detectNewlyDemonstrated(overlayBefore, overlayAfter);
    if (newlyDemonstrated.length === 0) return;
    const nodesById = new Map(nodes.map((n) => [n.id, n]));
    for (const nodeId of newlyDemonstrated) {
      const node = nodesById.get(nodeId);
      if (!node?.portableConcept) continue; // laconic-bridge.md: portable-only, no citation-grade "should we write" check needed beyond this
      invokeLaconicRecord(
        recordCmd,
        {
          conceptId: node.portableConcept.id,
          domain: node.portableConcept.domain,
          // laconic-bridge.md's exact evidence template -- states only
          // what happened (a demonstrated node), never a diagnosed
          // misconception or an invented claim (ADR-008 decision 5).
          evidence: `backbrief session (${repoBasename}): demonstrated understanding of ${node.question}`,
          date: clockNowIso().slice(0, 10), // YYYY-MM-DD, laconic_record.py's --date
        },
        runProcess,
      );
    }
  };
}

/** Narrow structural interface (not the `ModelStore` class) -- DI, code-style.md, mirrors digest.ts's `DigestDeps.modelStore` split. */
export interface OverlayApplier {
  snapshot(): ModelSnapshot;
  applyLive(envelope: Envelope): Promise<void>;
}

/**
 * Folds one envelope into the model store, additionally firing the laconic
 * write-back hook when (and only when) that envelope is the one that moves
 * a node INTO `demonstrated`. This is server.ts's `projectEnvelope`
 * chokepoint's own laconic-specific step, factored out here to keep
 * server.ts a pure composition root (its own module header) and to make
 * the once-only guard unit-testable without booting a real server.
 * @invariant only `node_response`/`move_response` ever trigger the
 *   before/after overlay diff (P11: the only two envelope types that can
 *   produce a `demonstrated` transition, overlay-fold.ts) -- every other
 *   envelope type takes the plain `applyLive` path, no extra snapshot cost.
 * @invariant the diff is taken around exactly ONE `applyLive` call (this
 *   envelope's own), so it can only ever observe THIS envelope's effect --
 *   the once-only guard laconic-transitions.ts's header describes.
 */
export async function applyEnvelopeAndFireLaconicWrite(
  modelStore: OverlayApplier,
  hook: LaconicWriteHook | null,
  envelope: Envelope,
): Promise<void> {
  const canAdvanceToDemonstrated =
    envelope.type === "node_response" || envelope.type === "move_response";
  if (!hook || !canAdvanceToDemonstrated) {
    await modelStore.applyLive(envelope);
    return;
  }
  const overlayBefore = modelStore.snapshot().overlay;
  await modelStore.applyLive(envelope);
  const after = modelStore.snapshot();
  hook(overlayBefore, after.overlay, after.nodes);
}
