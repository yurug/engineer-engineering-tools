// Module: watch/head-watcher -- polls the repo for HEAD moves and worktree
// dirtiness, and turns a change into the `head_changed` system event.
//
// Implements kb/spec/algorithms.md#head-change-handling: "A watcher polls
// `git rev-parse HEAD` + working-tree dirtiness every 2s. On change: emit
// `head_changed` system event... -> UI banner... -> revalidate citations of
// currently visible content... -> push `validation_update` WS frames ->
// understood-decay applies... as a pure consequence of folding the event."
// The 2s poll tick IS the debounce (kb/external/git-cli.md's agent note:
// "the watcher debounces (2s tick already)") -- no separate debounce timer.
// Key design decision (a genuine spec gap this module had to resolve, since
// data-model.md's `head_changed{from,to,changedPaths}` never distinguishes
// "HEAD moved" from "worktree got dirty"): this watcher fires on exactly
// two transitions --
//   (a) `headRev()` changes at all (covers commit, rebase, reset, pull --
//       anything that moves the ref) -- `to` is the new commit.
//   (b) the worktree becomes dirty while HEAD stays put -- `to` is the
//       literal "worktree" sentinel (matching CodeCitation.rev's own
//       convention for "not a commit, the live tree").
// A dirty-to-clean transition with HEAD unchanged (e.g. `git checkout --
// .`) is deliberately NOT reported: the tree is back to matching a commit
// it already matched, so there is nothing new to decay or revalidate.
// T10's two named scenarios ("Agent commits, rebases, or the human edits
// files") are exactly (a) and (b).
import type { Envelope } from "@backbrief/shared";
import type { RepoAccess } from "../repo";
import type { KbAccess } from "../kb-access";
import type { EventStore } from "../store/event-store";
import type { VisibleSetTracker } from "../visible-set";
import type { WsHub } from "../ws/hub";
import type { ModelStore } from "../store/model-store";
import { revalidatePaths } from "../validate/revalidate";
import { runMapStalenessPass } from "../validate/map-staleness";

/** Default poll interval -- algorithms.md's "every 2s". Overridable so integration tests don't need to sleep 2s+ per assertion. */
export const DEFAULT_HEAD_WATCH_INTERVAL_MS = 2_000;

export interface HeadWatcherDeps {
  repo: RepoAccess;
  eventStore: EventStore;
  kb: KbAccess;
  wsHub: WsHub;
  visibleSet: VisibleSetTracker;
  /** v2 (ADR-005): the comprehension map -- source for the staleness pass this watcher also runs on every HEAD move. */
  modelStore: ModelStore;
  /** Keeps the derived reader-state store in sync with the `head_changed` event this watcher appends -- same contract as api/actions.ts's and api/events.ts's `projectEnvelope`. */
  projectEnvelope: (envelope: Envelope) => Promise<void>;
  intervalMs?: number;
}

export interface HeadWatcherHandle {
  stop(): void;
}

interface PollState {
  head: string;
  dirty: boolean;
}

/**
 * @invariant P8c the comparison baseline is seeded (awaited, synchronously
 *   with startup) BEFORE this returns and BEFORE the poll interval starts --
 *   an `async` seed that server.ts merely fired-and-forgot (an earlier
 *   version of this function) raced a file edit landing between "server
 *   ready" and "baseline captured", silently swallowing the very first
 *   change (found by this step's own T10 integration test: a worktree edit
 *   made immediately after `startServer()` returned was sometimes absorbed
 *   into the baseline instead of detected). Making this function itself
 *   `async` and having the caller `await` it closes that window entirely.
 */
export async function startHeadWatcher(deps: HeadWatcherDeps): Promise<HeadWatcherHandle> {
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;
  let inFlight = false;

  let state: PollState = {
    head: await deps.repo.headRev(),
    dirty: await deps.repo.isWorktreeDirty(),
  };

  const poll = async (): Promise<void> => {
    // A slow git call (large repo, fs hiccup) must never overlap with
    // itself across ticks -- skip this tick rather than queue duplicate work.
    if (stopped || inFlight) return;
    inFlight = true;
    try {
      const next: PollState = {
        head: await deps.repo.headRev(),
        dirty: await deps.repo.isWorktreeDirty(),
      };
      const transition = computeTransition(state, next);
      if (transition) await applyTransition(transition, deps);
      state = next;
    } finally {
      inFlight = false;
    }
  };

  if (!stopped) {
    timer = setInterval(() => void poll(), deps.intervalMs ?? DEFAULT_HEAD_WATCH_INTERVAL_MS);
  }
  return {
    stop: () => {
      stopped = true;
      if (timer) clearInterval(timer);
    },
  };
}

interface Transition {
  from: string;
  to: string;
}

/** @returns the transition to report, or null if this tick's poll matches the two "nothing newsworthy" cases from the module header. */
function computeTransition(prev: PollState, next: PollState): Transition | null {
  if (next.head !== prev.head) return { from: prev.head, to: next.head };
  if (next.dirty && !prev.dirty) return { from: next.head, to: "worktree" };
  return null;
}

/** Computes `changedPaths`, appends+projects the `head_changed` event, and revalidates+broadcasts the visible/changed intersection. */
async function applyTransition(transition: Transition, deps: HeadWatcherDeps): Promise<void> {
  // "unborn" is not a real rev `git diff` can take a range against -- the
  // first-ever commit in a session that opened before any commit existed
  // has no prior tree to diff, so changedPaths is conservatively empty
  // (the banner still fires; there is simply nothing to decay yet).
  const changedPaths =
    transition.from === "unborn"
      ? []
      : await deps.repo.diffNameOnly(transition.from, transition.to);

  const result = await deps.eventStore.append({
    actor: "system",
    type: "head_changed",
    refs: [],
    payload: { from: transition.from, to: transition.to, changedPaths },
  });
  await deps.projectEnvelope(result.envelope);

  // v2 (ADR-005): comprehension-map.md's `nodes_invalidated` "head_changed"
  // trigger -- scoped to changedPaths, same as the citation revalidation
  // below, but a SEPARATE scan (map nodes vs. "currently visible" cards are
  // different sets of citations with different lifecycles). `deps` already
  // has every field `runMapStalenessPass` needs (repo/kb/eventStore/
  // modelStore/projectEnvelope), so it's passed straight through.
  if (changedPaths.length > 0) {
    await runMapStalenessPass(deps, "head_changed", changedPaths);
  }

  const visible = deps.visibleSet.paths();
  const targetPaths = changedPaths.filter((p) => visible.has(p));
  if (targetPaths.length === 0) return;
  const updates = await revalidatePaths(targetPaths, {
    eventStore: deps.eventStore,
    repo: deps.repo,
    kb: deps.kb,
  });
  deps.wsHub.broadcastValidationUpdate(updates);
}
