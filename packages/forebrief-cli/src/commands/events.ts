// Module: commands/events -- `forebrief events [--since N] [--follow]
// [--timeout SECS]` (kb/spec/cli-contract.md).
//
// @invariant algorithms.md: "--follow warns (does not refuse) on no open
//   sit-down -- enforcement is the skill's rule, the warning is the tripwire."
import { findLiveServer } from "../discovery";
import { getText, eventsUrl, describeApiError } from "../http-client";
import { EXIT_ERROR, EXIT_OK, type Io } from "../output";
import type { ServerInfo } from "@forebrief/server";

export interface EventsOptions {
  repoStartDir: string;
  since?: number;
  follow: boolean;
  timeoutSecs?: number;
  io: Io;
}

/** @returns true iff the most recent `sit_down` envelope in `jsonl` has `open:true`. */
function hasOpenSitDown(jsonl: string): boolean {
  const lines = jsonl.trim().length > 0 ? jsonl.trim().split("\n") : [];
  const sitDowns = lines
    .map((l) => JSON.parse(l) as { type: string; payload: { open: boolean } })
    .filter((e) => e.type === "sit_down");
  return sitDowns.at(-1)?.payload.open === true;
}

export async function runEventsCommand(opts: EventsOptions): Promise<number> {
  const found = await findLiveServer(opts.repoStartDir);
  if (!found) {
    opts.io.writeErr("forebrief: no server running for this repo -- run `forebrief serve`");
    return EXIT_ERROR;
  }

  if (!opts.follow) {
    const result = await getText(found.info, `/api/events?since=${String(opts.since ?? 0)}`);
    if (!result.ok) {
      opts.io.writeErr(`forebrief: ${describeApiError(result.error)}`);
      return EXIT_ERROR;
    }
    if (result.body.length > 0) opts.io.writeOut(result.body.replace(/\n$/, ""));
    return EXIT_OK;
  }

  const snapshot = await getText(found.info, "/api/events?since=0");
  if (snapshot.ok && !hasOpenSitDown(snapshot.body)) {
    opts.io.writeErr(
      "forebrief: --follow with no open sit-down -- only wait on events during a declared sit-down session (kb/spec/algorithms.md)",
    );
  }
  return followEvents(found.info, opts);
}

async function followEvents(info: ServerInfo, opts: EventsOptions): Promise<number> {
  const controller = new AbortController();
  const timer =
    opts.timeoutSecs !== undefined
      ? setTimeout(() => controller.abort(), opts.timeoutSecs * 1000)
      : undefined;
  try {
    const res = await fetch(
      eventsUrl(info, `/api/events/follow?since=${String(opts.since ?? 0)}`),
      {
        headers: { Authorization: `Bearer ${info.token}` },
        signal: controller.signal,
      },
    );
    if (!res.body) {
      opts.io.writeErr("forebrief: no response body from the follow endpoint");
      return EXIT_ERROR;
    }
    await pumpSseEnvelopes(res.body, opts.io);
    return EXIT_OK;
  } catch (error) {
    if (controller.signal.aborted) return EXIT_OK; // --timeout elapsed -- an ordinary, expected end
    opts.io.writeErr(`forebrief: ${error instanceof Error ? error.message : String(error)}`);
    return EXIT_ERROR;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Decodes hono's SSE wire format, forwarding only `event: envelope` frames as one JSON line each. */
async function pumpSseEnvelopes(body: ReadableStream<Uint8Array>, io: Io): Promise<void> {
  let buffer = "";
  for await (const chunk of body) {
    buffer += Buffer.from(chunk).toString("utf8");
    let boundary: number;
    while ((boundary = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      emitIfEnvelope(block, io);
    }
  }
}

function emitIfEnvelope(block: string, io: Io): void {
  const lines = block.split("\n");
  const eventLine = lines.find((l) => l.startsWith("event: "));
  const dataLine = lines.find((l) => l.startsWith("data: "));
  if (eventLine?.slice("event: ".length) === "envelope" && dataLine) {
    io.writeOut(dataLine.slice("data: ".length));
  }
}
