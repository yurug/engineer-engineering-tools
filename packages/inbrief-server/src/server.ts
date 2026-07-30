// Module: server -- the composition root. Wires fsguard, the event store, auth
// and the app into one running instance, and returns a handle both the CLI and
// the tests use identically.
//
// Mirrors forebrief's own startServer, which mirrors backbrief's. The shape is
// deliberately boring: one async function, one close()-able handle, no globals,
// so an integration test can run a real server in-process without a daemon.
//
// @invariant P8 -- binds 127.0.0.1 and nothing else. Not configurable, because a
//   configurable bind address is one config mistake away from breaking the
//   property the whole tool rests on.
import type { Server as NodeHttpServer } from "node:http";
import { serve as serveHttp } from "@hono/node-server";
import { systemClock, ulidGenerator, type Clock, type IdGenerator } from "@brief/shared";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { homedir } from "node:os";
import {
  EventStore,
  generateTokens,
  mountStaticWeb,
  recoverStaleArtifactsOrThrow,
  removeLock,
  removeServerJson,
  writeLock,
  writeServerJson,
} from "@brief/core";
import { resolveInbriefPath } from "./fsguard";
import { buildApp } from "./app";
import { makeKbAccess, makeRepoAccess } from "./repo-access";
import { Session } from "./session/session";
import { readKnowledgeModel } from "./session/knowledge-model";
import { readMaterial } from "./material/read";
import { readProjectConfig } from "./material/config";
import { intakeNode } from "./nodes/intake";
import { discoverRecordCmd, writeBackConceded } from "./session/write-back";

/** @invariant P8. A literal, never a parameter. */
const LOOPBACK_ONLY = "127.0.0.1";
const EVENTS_LOG = "events.jsonl";
/** inbrief's choice of core's required stateDirName parameter (P4). */
const STATE_DIR = ".inbrief";

export interface StartServerOptions {
  /** Absolute path to the project being taught. */
  repoRoot: string;
  /** Omit for a random free port; the CLI passes one when the caller asked. */
  port?: number;
  /** Test seam: override clock and ids (DI, so a test can be deterministic). */
  deps?: { clock?: Clock; ids?: IdGenerator };
  /**
   * Where laconic keeps its store. Defaults to `$LACONIC_HOME` then `~/.laconic`,
   * matching backbrief's own resolution so the two tools read one store.
   */
  laconicHome?: string;
  /**
   * Absolute path to @inbrief/web's built output. Defaults to the sibling
   * package's dist/.
   *
   * When it is missing, the API still serves and only the browser is absent: an
   * unbuilt web package must not stop `act` and `status` from working, because a
   * developer who has not run `vite build` still needs the rest of the tool.
   */
  webDistDir?: string;
}

export interface ServerHandle {
  port: number;
  /**
   * Identifies this SERVER RUN, not the teaching session.
   *
   * The distinction matters and is easy to lose: inbrief's log is per-repo and a
   * teaching session may span days across many server runs (kb/domain/prd.md),
   * unlike backbrief where one log is one session. So a new sessionId here does
   * NOT mean a new session for the engineer, and nothing should key coverage off
   * it.
   */
  sessionId: string;
  /** The URL a human opens. Carries the HUMAN token, never the agent's. */
  url: string;
  /** The agent's credential. Must never appear in a URL shown to a human. */
  agentToken: string;
  humanToken: string;
  session: Session;
  close: () => Promise<void>;
}

export async function startServer(options: StartServerOptions): Promise<ServerHandle> {
  const clock = options.deps?.clock ?? systemClock;
  const ids = options.deps?.ids ?? ulidGenerator;

  // A previous run that died leaves a lock and a server.json behind. Core
  // refuses only when it can positively confirm a LIVE instance; anything
  // weaker is cleaned, so a crash never permanently blocks the next serve.
  await recoverStaleArtifactsOrThrow(options.repoRoot, STATE_DIR);

  // Before anything reads or proposes material. A config that cannot be trusted
  // stops the session here rather than quietly aiming proposals at a directory
  // this project does not use (ADR-029).
  const config = await readProjectConfig(options.repoRoot);

  // fsguard resolves the path, so the log's location is confined by
  // construction rather than by everyone remembering to prefix it.
  const store = await EventStore.open(resolveInbriefPath(options.repoRoot, EVENTS_LOG), {
    ids,
    clock,
  });
  // Read once at startup rather than per request: the model changes at human
  // pace, and re-reading it on every state fetch would put a directory scan in
  // the path of every keystroke's refresh.
  const model = await readKnowledgeModel(
    options.laconicHome ?? process.env["LACONIC_HOME"] ?? path.join(homedir(), ".laconic"),
  );
  const session = new Session(store, model);
  // A TEST MUST NEVER REACH THE REAL STORE, and this guard exists because one
  // did. The api tests start a real server, which found the real laconic tool,
  // and a concession test wrote three fabricated observations about the engineer
  // into a store that is committed and synced: they claimed the engineer had
  // contested a fixture's node, and they lifted a concept from `exposed` to
  // `familiar` on evidence of nothing.
  //
  // Here rather than inside discoverRecordCmd, which is a pure lookup with its
  // own tests. The danger is not looking a path up; it is a REAL server, started
  // by a test, writing to a store shared with two other tools.
  const recordCmd = process.env["VITEST"] === undefined ? await discoverRecordCmd(homedir()) : null;

  // Material the project already carries becomes part of the map at startup
  // (ADR-004, ADR-007). It goes through the SAME gate as anything the agent
  // proposes: a hand-written node whose citation has rotted is refused exactly
  // as an invented one would be, because P1 is about the claim, not its author.
  await loadMaterial(
    options.repoRoot,
    session,
    makeRepoAccess(options.repoRoot),
    config.materialDir,
  );
  const tokens = generateTokens();
  // `close` is defined below and captured here, so /api/stop tears down the same
  // way a test's handle.close() does. One shutdown path, not two.
  let closeSelf: () => Promise<void> = () => Promise.resolve();
  const app = buildApp({
    tokens,
    session,
    repo: makeRepoAccess(options.repoRoot),
    kb: makeKbAccess(options.repoRoot),
    materialDir: config.materialDir,
    // The one trigger that is not self-report (ADR-035). Discovered once at
    // startup: a missing laconic tool means sessions do not compound, which is
    // not a reason to fail one.
    writeBack: (node) => writeBackConceded(node, path.basename(options.repoRoot), { recordCmd }),
    onStop: () => void closeSelf(),
  });

  // Mounted before listen so the very first request can be the browser's.
  await mountStaticWeb(app, options.webDistDir ?? path.join(__dirname, "../../web/dist"));

  const server = await listen(app.fetch.bind(app), options.port ?? 0);
  const port = addressPort(server);
  const sessionId = ids.next();
  const url = `http://${LOOPBACK_ONLY}:${String(port)}/?token=${tokens.humanToken}`;

  // Discovery is what lets `act`, `status` and `stop` find this process without
  // being told a port. `token` here is the AGENT token deliberately: the human
  // token appears only inside `url`, and swapping them would leak the agent's
  // credential into something shown to a person.
  const startedAt = clock.nowIso();
  await writeRuntimeGitignore(options.repoRoot);
  await writeLock(options.repoRoot, STATE_DIR, { pid: process.pid, startedAt });
  await writeServerJson(options.repoRoot, STATE_DIR, {
    pid: process.pid,
    port,
    url,
    token: tokens.agentToken,
    sessionId,
    startedAt,
  });

  const close = async (): Promise<void> => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await store.close();
    // Order matters on the way out too: remove discovery LAST, so a CLI that
    // read server.json a moment ago fails to connect rather than being told
    // there is no server while one is still finishing its shutdown.
    await removeServerJson(options.repoRoot, STATE_DIR);
    await removeLock(options.repoRoot, STATE_DIR);
  };
  closeSelf = close;

  return {
    port,
    sessionId,
    url,
    agentToken: tokens.agentToken,
    humanToken: tokens.humanToken,
    session,
    close,
  };
}

/**
 * Ignores the RUNTIME files inside `.inbrief/`, so a project can commit the ones
 * that are not runtime.
 *
 * Written on first serve, the way forebrief writes `.forebrief/.gitignore`. Its
 * point is `config.json`: a project that states where its material lives has to
 * be able to commit that statement, and it cannot if the whole directory reads
 * as noise in `git status` (ADR-029).
 *
 * @invariant never overwrites. The file is the project's after it exists, and a
 *   tool that rewrites it every start is a tool that discards an edit somebody
 *   made on purpose.
 * @invariant `events.jsonl` is deliberately ABSENT from the list. Whether a
 *   session log belongs in a shared repository is undecided, and it holds one
 *   engineer's mastery, so this leaves it visible and untracked rather than
 *   answering that quietly in a generated file.
 */
async function writeRuntimeGitignore(repoRoot: string): Promise<void> {
  const file = resolveInbriefPath(repoRoot, ".gitignore");
  try {
    await fs.writeFile(file, "server.json\nserver.lock\nserver.log\n", { flag: "wx" });
  } catch {
    // Already there, or unwritable. Neither is worth failing a session over.
  }
}

/**
 * Admits a project's existing material into the session.
 *
 * @invariant refusals are logged and skipped, never fatal. A project whose
 *   documentation has drifted from its code should still get a session about
 *   the parts that still hold, with the rotted parts absent rather than the
 *   whole thing refusing to start.
 * @invariant admitted in DEPENDENCY order, by repeated passes rather than by a
 *   sort. The reader returns filename order, which is deterministic and was
 *   never the same thing as loadable: the gate refuses a node whose prerequisite
 *   is not in the map yet, so the first real round trip admitted one file of
 *   fifteen because the alphabet put the dependents first (ADR-032).
 *
 *   A fixpoint rather than a topological sort because the input is untrusted.
 *   Material can name a prerequisite that does not exist, or two files can name
 *   each other, and a sort has to decide what to do about that. Passing until
 *   nothing more is admissible leaves exactly the unsatisfiable ones out, which
 *   is what the gate would have decided anyway.
 */
async function loadMaterial(
  repoRoot: string,
  session: Session,
  repo: ReturnType<typeof makeRepoAccess>,
  materialDir: string,
): Promise<void> {
  let pending = await readMaterial(repoRoot, materialDir);
  for (;;) {
    const stuck: typeof pending = [];
    let admittedThisPass = 0;
    for (const submission of pending) {
      const result = await intakeNode(submission, repo, session.state().nodes);
      if (result.admitted) {
        await session.addNode(result.node, "material");
        admittedThisPass += 1;
      } else {
        stuck.push(submission);
      }
    }
    pending = stuck;
    // Nothing new got in, so nothing will: the rest are refused on their own
    // merits (a rotted citation, a budget, a prerequisite nobody wrote).
    if (admittedThisPass === 0 || pending.length === 0) break;
  }
}

/** Wraps @hono/node-server's callback-style listen so startServer can await it. */
function listen(
  fetch: Parameters<typeof serveHttp>[0]["fetch"],
  port: number,
): Promise<NodeHttpServer> {
  return new Promise((resolve) => {
    const server = serveHttp({ fetch, port, hostname: LOOPBACK_ONLY }, () =>
      resolve(server as unknown as NodeHttpServer),
    );
  });
}

function addressPort(server: NodeHttpServer): number {
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("server bound to a pipe or socket; expected a TCP port");
  }
  return address.port;
}
