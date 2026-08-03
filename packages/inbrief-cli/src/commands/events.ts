// Module: commands/events -- the engineer-to-agent inbox.
import type { Actor, Envelope } from "@brief/shared";
import { pumpSseEvents } from "@brief/core";
import { apiBase, connect } from "../discovery";
import { EXIT_ERROR, EXIT_OK, type Io } from "../output";

export interface EventsOptions {
  repoStartDir: string;
  since: number;
  follow: boolean;
  timeoutSecs?: number;
  actor?: Actor;
  io: Io;
}

export async function runEventsCommand(opts: EventsOptions): Promise<number> {
  const found = await connect(opts.repoStartDir);
  if (!found.ok) {
    opts.io.writeErr(`inbrief: ${found.reason}`);
    return EXIT_ERROR;
  }
  const { info } = found.connection;
  if (!opts.follow) {
    const res = await fetch(`${apiBase(info)}/api/events?since=${String(opts.since)}`, {
      headers: { Authorization: `Bearer ${info.token}` },
    });
    if (!res.ok) {
      opts.io.writeErr(`inbrief: events failed (HTTP ${String(res.status)})`);
      return EXIT_ERROR;
    }
    const lines = (await res.text()).trim().split("\n").filter(Boolean);
    for (const line of lines) {
      if (opts.actor === undefined || (JSON.parse(line) as Envelope).actor === opts.actor) {
        opts.io.writeOut(line);
      }
    }
    return EXIT_OK;
  }

  const controller = new AbortController();
  const timer =
    opts.timeoutSecs === undefined
      ? undefined
      : setTimeout(() => controller.abort(), opts.timeoutSecs * 1000);
  try {
    const res = await fetch(`${apiBase(info)}/api/events/follow?since=${String(opts.since)}`, {
      headers: { Authorization: `Bearer ${info.token}` },
      signal: controller.signal,
    });
    if (!res.ok || !res.body) {
      opts.io.writeErr(`inbrief: events follow failed (HTTP ${String(res.status)})`);
      return EXIT_ERROR;
    }
    await pumpSseEvents(res.body, {
      ...(opts.actor !== undefined ? { actor: opts.actor } : {}),
      exitAfterFirstMatch: opts.timeoutSecs !== undefined,
      writeEnvelope: (json) => opts.io.writeOut(json),
    });
    if (opts.timeoutSecs !== undefined) controller.abort();
    return EXIT_OK;
  } catch (error) {
    if (controller.signal.aborted) return EXIT_OK;
    opts.io.writeErr(`inbrief: events follow failed: ${String(error)}`);
    return EXIT_ERROR;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
