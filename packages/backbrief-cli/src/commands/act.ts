// Module: commands/act -- `backbrief act FILE.json | backbrief act -`.
//
// Implements kb/spec/api-contracts.md#cli's `act` row: posts one action,
// prints the validation report JSON, and maps it to the exit-code contract
// (0 valid, 2 flagged/partial, 1 error) -- "flagged" here means the
// server's `report.flagged > 0` (agent notes, api-contracts.md: "treat it
// as shown but degraded, not success").
import * as fs from "node:fs/promises";
import { findLiveServer } from "../discovery";
import { authHeaders, baseUrl, isApiError } from "../http-client";
import { EXIT_ERROR, EXIT_FLAGGED, EXIT_OK, type Io } from "../output";
import { readStdin } from "../stdin";

export interface ActDeps {
  repoStartDir: string;
  io: Io;
}

export async function runActCommand(source: string, deps: ActDeps): Promise<number> {
  const discovered = await findLiveServer(deps.repoStartDir);
  if (!discovered) {
    deps.io.writeErr("backbrief: no server running for this repo (run `backbrief serve` first)");
    return EXIT_ERROR;
  }
  const raw = source === "-" ? await readStdin() : await fs.readFile(source, "utf8");
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    deps.io.writeErr(`backbrief: ${source === "-" ? "stdin" : source} is not valid JSON`);
    return EXIT_ERROR;
  }

  const res = await fetch(`${baseUrl(discovered.info)}/api/actions`, {
    method: "POST",
    headers: { ...authHeaders(discovered.info), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed: unknown = await res.json();
  deps.io.writeOut(JSON.stringify(parsed));

  if (!res.ok) {
    if (isApiError(parsed)) deps.io.writeErr(`backbrief: ${parsed.error.message}`);
    return EXIT_ERROR;
  }
  const flagged = hasFlaggedCitations(parsed);
  return flagged ? EXIT_FLAGGED : EXIT_OK;
}

function hasFlaggedCitations(body: unknown): boolean {
  if (typeof body !== "object" || body === null || !("report" in body)) return false;
  const report = body.report;
  return (
    typeof report === "object" &&
    report !== null &&
    "flagged" in report &&
    Number(report.flagged) > 0
  );
}
