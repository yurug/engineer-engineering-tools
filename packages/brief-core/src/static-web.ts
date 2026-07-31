// Module: static-web -- serves a built SPA (React + Vite) at `/`.
//
// Extracted from @backbrief/server (ADR-001) -- already fully parameterized
// by `webDistDir` in the original, so nothing to decouple. A hand-rolled
// handler (not @hono/node-server's serveStatic helper) so the "no web/dist
// yet" case (every server-package test, which never runs `vite build`)
// degrades to "API-only, no static routes" instead of a throw.
// Key design decision: SPA fallback (unknown paths -> index.html) so the
// client-side app can use any URL shape later without a server-side route
// for each one; `/api/*` and `/ws` are never reached here as long as the
// caller mounts this LAST, after those routes.
//
// Generic in the app's Env (2026-07-28, needed by inbrief): a consumer that
// TYPES its per-request context variables -- rather than casting `c.get()` at
// each use -- has a `Hono<TheirEnv>`, which is not assignable to a bare `Hono`.
// This function only registers a wildcard GET and reads nothing from the
// context, so it has no business constraining the caller's env.
import type { Env, Hono } from "hono";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { resolveRepoPath } from "./fsguard";

/**
 * @param webDistDir absolute path to the built web app's output -- ALWAYS
 *   inject this explicitly; there is no safe default (a consumer's own
 *   monorepo layout is the only thing that knows where its `web` package
 *   builds to)
 * @returns true if the directory exists and static routes were mounted
 */
export async function mountStaticWeb<E extends Env>(
  app: Hono<E>,
  webDistDir: string,
): Promise<boolean> {
  try {
    await fs.access(path.join(webDistDir, "index.html"));
  } catch {
    return false; // web/dist not built -- API-only, no throw
  }

  app.get("*", async (c) => {
    const requestPath = new URL(c.req.url).pathname;
    const relative =
      requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
    const candidate = safeJoin(webDistDir, relative);
    const served = candidate ? await tryServeFile(candidate) : null;
    if (served)
      return c.text(served.body, 200, { "Content-Type": served.contentType });
    // SPA fallback: any non-file path (client-side route) gets index.html.
    const indexFile = await fs.readFile(
      path.join(webDistDir, "index.html"),
      "utf8",
    );
    return c.text(indexFile, 200, {
      "Content-Type": "text/html; charset=utf-8",
    });
  });
  return true;
}

/** Reuses fsguard's containment check so a crafted request path can't escape webDistDir. */
function safeJoin(webDistDir: string, relative: string): string | null {
  try {
    return resolveRepoPath(webDistDir, relative);
  } catch {
    return null;
  }
}

// Text-only, deliberately: HTML/JS/CSS/JSON/SVG, no binary assets -- reading
// everything as UTF-8 text sidesteps a Buffer-vs-Hono-body typed-array
// generics mismatch without a manual byte-copy workaround. A later binary
// asset needs a `c.body(Uint8Array)` path added back for that content-type.
async function tryServeFile(
  absolutePath: string,
): Promise<{ body: string; contentType: string } | null> {
  try {
    const stat = await fs.stat(absolutePath);
    if (!stat.isFile()) return null;
    return {
      body: await fs.readFile(absolutePath, "utf8"),
      contentType: guessContentType(absolutePath),
    };
  } catch {
    return null;
  }
}

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function guessContentType(filePath: string): string {
  return CONTENT_TYPES[path.extname(filePath)] ?? "application/octet-stream";
}
