// Module: commands/status -- `forebrief status`.
//
// kb/spec/cli-contract.md: "Liveness + progress" ->
// `{running, sessionId, url, roundOpen, cardsDecided, cardsTotal}` or
// `{running:false}`; "before rounds exist (plan step 1) roundOpen:false,
// cardsDecided:0, cardsTotal:0". The round/card fields come from a REAL
// `GET /api/state` call against the discovered server (not hardcoded here)
// so step 2 only has to change the server's route, never this command.
import { findLiveServer } from "../discovery";
import { EXIT_OK, type Io } from "../output";
import type { ServerInfo } from "@forebrief/server";

export interface StatusOptions {
  repoStartDir: string;
  io: Io;
}

interface RoundState {
  roundOpen: boolean;
  cardsDecided: number;
  cardsTotal: number;
}

const NO_ROUND_STATE: RoundState = { roundOpen: false, cardsDecided: 0, cardsTotal: 0 };

export async function runStatusCommand(opts: StatusOptions): Promise<number> {
  const found = await findLiveServer(opts.repoStartDir);
  if (!found) {
    opts.io.writeOut(JSON.stringify({ running: false }));
    return EXIT_OK;
  }
  const state = await fetchRoundState(found.info);
  opts.io.writeOut(
    JSON.stringify({
      running: true,
      sessionId: found.info.sessionId,
      url: found.info.url,
      ...state,
    }),
  );
  return EXIT_OK;
}

/** Falls back to the no-round shape if the server is unreachable mid-check (T1-adjacent: never hang or crash `status` on a race with the daemon exiting). `/api/state` returns more than these three fields (round, records) -- `status`'s own output contract (kb/spec/cli-contract.md) is only ever these three, so they are picked explicitly rather than spread. */
async function fetchRoundState(info: ServerInfo): Promise<RoundState> {
  try {
    const res = await fetch(`http://127.0.0.1:${String(info.port)}/api/state`, {
      headers: { Authorization: `Bearer ${info.token}` },
    });
    if (!res.ok) return NO_ROUND_STATE;
    const body = (await res.json()) as RoundState;
    return {
      roundOpen: body.roundOpen,
      cardsDecided: body.cardsDecided,
      cardsTotal: body.cardsTotal,
    };
  } catch {
    return NO_ROUND_STATE;
  }
}
