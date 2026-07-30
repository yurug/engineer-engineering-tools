// Module: commands/act -- `inbrief act FILE.json | -`, the agent's way to put a
// node into the session.
//
// One command rather than one per record type, matching the sibling tools: the
// agent has exactly one verb for "add something to the log", and the payload's
// own `kind` says what. That keeps the CLI surface from growing a verb every
// time the record set does.
import { connect, apiBase } from "../discovery";
import { EXIT_ERROR, EXIT_OK, type Io } from "../output";

export interface ActOptions {
  /** Path to a JSON file, or "-" for stdin. */
  file: string;
  repoStartDir: string;
  io: Io;
  readFile: (file: string) => Promise<string>;
  readStdin: () => Promise<string>;
}

export async function runActCommand(opts: ActOptions): Promise<number> {
  const found = await connect(opts.repoStartDir);
  if (!found.ok) {
    opts.io.writeErr(`inbrief: ${found.reason}`);
    return EXIT_ERROR;
  }

  let body: unknown;
  try {
    const raw = opts.file === "-" ? await opts.readStdin() : await opts.readFile(opts.file);
    body = JSON.parse(raw);
  } catch (error) {
    opts.io.writeErr(`inbrief: could not read JSON from ${opts.file}: ${describe(error)}`);
    return EXIT_ERROR;
  }

  // The record's own `kind` picks the route. An unknown kind is refused here
  // rather than sent, so the error names the CLI's vocabulary instead of
  // returning a 404 that reads like a bug in the server.
  const kind = (body as { kind?: string }).kind;
  const route = ROUTES[kind ?? ""];
  if (!route) {
    opts.io.writeErr(
      `inbrief: unknown kind ${JSON.stringify(kind)}. Expected one of: ${Object.keys(ROUTES).join(", ")}`,
    );
    return EXIT_ERROR;
  }

  const { info } = found.connection;
  const res = await fetch(`${apiBase(info)}${route}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${info.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    // The server's JSON body is the useful part (which refusals fired), so it
    // goes to stdout as-is and the human-facing summary goes to stderr.
    opts.io.writeOut(text);
    opts.io.writeErr(`inbrief: ${route} refused with ${String(res.status)}`);
    return EXIT_ERROR;
  }
  opts.io.writeOut(text);
  return EXIT_OK;
}

/**
 * Which route each record kind posts to.
 *
 * **`mastery` is deliberately absent.** The CLI authenticates with the AGENT
 * token off `server.json`, and P3 forbids an agent moving mastery, so a mastery
 * route here could only ever return 403. It was listed once, on the reasoning
 * that the server decides by token anyway and an extra entry harmed nothing.
 * The end-to-end test disagreed: an entry that can never succeed is a promise
 * the CLI cannot keep, and a caller reads its presence as permission.
 *
 * Mastery is claimed in the browser, which is where the human's token lives.
 */
const ROUTES: Record<string, string> = {
  node: "/api/nodes",
  agenda: "/api/agenda",
  // `answer` is here and `question` deliberately is not: the CLI holds the agent
  // token, and P3 makes asking in the engineer's name impossible rather than
  // discouraged, exactly as it does for mastery (ADR-030).
  answer: "/api/answers",
  // Conceding is the agent's move and contesting is the engineer's, so this
  // belongs to the token the CLI holds and its mirror never will (ADR-035).
  concession: "/api/concessions",
  finding: "/api/findings",
  close: "/api/close",
};

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
