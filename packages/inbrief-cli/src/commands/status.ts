// Module: commands/status -- `inbrief status`, liveness plus progress.
//
// Answers the two questions an agent asks before doing anything: is a session
// running, and how far through the map is the engineer. Both come from the
// server, because computing progress here would put a second implementation of
// "what counts as covered" next to the one in Session.
import { connect, apiBase } from "../discovery";
import { EXIT_OK, type Io } from "../output";

export interface StatusOptions {
  repoStartDir: string;
  io: Io;
}

interface State {
  nodes: { id: string }[];
  mastery: Record<string, string>;
  closed: boolean;
}

/** Mastery states that count as held. Mirrors Session's own HELD list. */
const HELD = new Set(["grasped", "demonstrated"]);

/**
 * @returns EXIT_OK even when nothing is running. "Not running" is an answer to
 *   the question asked, not a failure to answer it, and an agent scripting
 *   against this should not have to treat a truthful no as an error.
 */
export async function runStatusCommand(opts: StatusOptions): Promise<number> {
  const found = await connect(opts.repoStartDir);
  if (!found.ok) {
    opts.io.writeOut(JSON.stringify({ running: false }));
    return EXIT_OK;
  }
  const { info } = found.connection;
  const res = await fetch(`${apiBase(info)}/api/state`, {
    headers: { Authorization: `Bearer ${info.token}` },
  });
  if (!res.ok) {
    // server.json exists but nothing answers: a dead process left its files.
    opts.io.writeOut(JSON.stringify({ running: false, stale: true }));
    return EXIT_OK;
  }
  const state = (await res.json()) as State;
  const covered = Object.values(state.mastery).filter((m) => HELD.has(m)).length;
  opts.io.writeOut(
    JSON.stringify({
      running: true,
      sessionId: info.sessionId,
      url: info.url,
      closed: state.closed,
      nodes: state.nodes.length,
      covered,
    }),
  );
  return EXIT_OK;
}
