// Module: commands/events -- `backbrief events [--since N] [--follow]
// [--timeout SECS]`.
//
// This is step 1's named biggest unknown made concrete (kb/plan.md): the
// agent's entire inbound push channel is `events --follow` run as a
// background process (ADR-001). kb/external/claude-code-agent-runtime.md
// requires BOTH of these to work, because whether the host notices
// background output per-line or only on exit is unverifiable without a
// live Claude Code session:
//   - bare `--follow`: streams every envelope to stdout as JSONL, forever,
//     for a host that wakes the agent on each line of output.
//   - `--follow --timeout SECS`: the same stream, but exits after SECS
//     seconds OR immediately after the first envelope, whichever comes
//     first -- the "chunked-follow fallback" for a host that only notices
//     output on process exit. The agent relaunches this in a loop.
// Both modes share one SSE consumer (../sse.ts); only the exit condition differs.
import type { ServerInfo } from "@backbrief/server";
import { findLiveServer } from "../discovery";
import { authHeaders, baseUrl, errorMessageFrom } from "../http-client";
import { EXIT_ERROR, EXIT_OK, type Io } from "../output";
import { parseSseStream } from "../sse";

export interface EventsOptions {
  since: number;
  follow: boolean;
  timeoutSecs?: number;
}

export interface EventsDeps {
  repoStartDir: string;
  io: Io;
}

export async function runEventsCommand(opts: EventsOptions, deps: EventsDeps): Promise<number> {
  const discovered = await findLiveServer(deps.repoStartDir);
  if (!discovered) {
    deps.io.writeErr("backbrief: no server running for this repo (run `backbrief serve` first)");
    return EXIT_ERROR;
  }
  if (!opts.follow) {
    return fetchOnce(opts.since, discovered.info, deps.io);
  }
  return followEvents(opts, discovered.info, deps.io);
}

/** `--since N` without `--follow`: one read, always safe (P6: the log is immutable and cursor-ordered). */
async function fetchOnce(since: number, info: ServerInfo, io: Io): Promise<number> {
  const res = await fetch(`${baseUrl(info)}/api/events?since=${String(since)}`, {
    headers: authHeaders(info),
  });
  if (!res.ok) {
    // U4 (Phase 5 audit): see commands/digest.ts's identical fix.
    io.writeErr(`backbrief: failed to fetch events: ${await errorMessageFrom(res)}`);
    return EXIT_ERROR;
  }
  const envelopes = (await res.json()) as unknown[];
  for (const envelope of envelopes) io.writeOut(JSON.stringify(envelope));
  return EXIT_OK;
}

async function followEvents(opts: EventsOptions, info: ServerInfo, io: Io): Promise<number> {
  const controller = new AbortController();
  const timer =
    opts.timeoutSecs !== undefined
      ? setTimeout(() => controller.abort(), opts.timeoutSecs * 1000)
      : undefined;
  let res: Response;
  try {
    res = await fetch(`${baseUrl(info)}/api/events/follow?since=${String(opts.since)}`, {
      headers: authHeaders(info),
      signal: controller.signal,
    });
  } catch (error) {
    if (timer) clearTimeout(timer);
    // Timed out (or was killed) before the connection even opened -- an
    // empty, successful chunk: the agent's relaunch loop tries again.
    if (isAbortError(error)) return EXIT_OK;
    io.writeErr(`backbrief: could not reach events/follow: ${String(error)}`);
    return EXIT_ERROR;
  }
  if (!res.ok || !res.body) {
    if (timer) clearTimeout(timer);
    // U4: `res.json()` would misread the (successful) SSE stream as JSON,
    // so it is only attempted on the genuine error branch (`!res.ok`) --
    // the `res.ok && !res.body` case is a different, body-less anomaly.
    const message = res.ok ? "empty response body" : await errorMessageFrom(res);
    io.writeErr(`backbrief: events/follow failed: ${message}`);
    return EXIT_ERROR;
  }
  await pumpFollowStream(res.body, opts.timeoutSecs !== undefined, controller, io);
  if (timer) clearTimeout(timer);
  return EXIT_OK;
}

async function pumpFollowStream(
  body: ReadableStream<Uint8Array>,
  exitAfterFirstEnvelope: boolean,
  controller: AbortController,
  io: Io,
): Promise<void> {
  try {
    for await (const frame of parseSseStream(body)) {
      if (frame.event !== "envelope") continue; // heartbeat frames just keep the loop alive
      io.writeOut(frame.data);
      // T5/NF2: printing is what re-invokes a background-output-driven
      // host; the --timeout chunked fallback additionally exits right
      // here so a per-exit-only host notices too.
      if (exitAfterFirstEnvelope) {
        controller.abort();
        return;
      }
    }
  } catch (error) {
    if (!isAbortError(error)) throw error;
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
