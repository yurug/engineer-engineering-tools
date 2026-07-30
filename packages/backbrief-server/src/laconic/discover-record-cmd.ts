// Module: laconic/discover-record-cmd -- resolves the path to
// laconic_record.py, the ONLY sanctioned write entry point
// (laconic-bridge.md#write: "through laconic_record.py ONLY").
//
// Resolution order (laconic-bridge.md#write): `config.laconic.recordCmd` if
// it resolves, else discovery. Discovery tries, in order:
//   1. the dev-checkout convention this project's own KB was pointed at
//      (~/work/dev/laconic-skill/tools/laconic_record.py);
//   2. an installed claude-code plugin copy -- confirmed on this machine at
//      ~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/tools/
//      laconic_record.py (`find`-verified against a real install while
//      building this module, not a guess); a small, BOUNDED three-level
//      enumeration (marketplace -> plugin -> version) that mirrors that
//      exact layout, not an open-ended filesystem walk;
//   3. PATH.
// Every candidate is checked with `fs.access` (existence only -- execute
// permission is never required, since the caller always invokes via
// `python3 <path> ...`, never the script's own shebang -- write.ts).
// `os.homedir()` is injected as `homedir`, not called here -- home.ts's
// module header explains why (DI, avoids resolving against the real dev
// box's actual ~/work/dev/laconic-skill / ~/.claude/plugins/cache in tests).
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Config } from "../store/config";
import type { LaconicEnv } from "./home";

/**
 * @param homedir the caller's `os.homedir()` (DI, home.ts's module header)
 * @returns an existing path to `laconic_record.py`, or `null` if none of
 *   the candidates resolve -- laconic-bridge.md: "if `recordCmd` can't be
 *   resolved -> READ still works, WRITE no-ops."
 */
export async function discoverLaconicRecordCmd(
  config: Config,
  env: LaconicEnv,
  homedir: string,
): Promise<string | null> {
  const configured = config.laconic?.recordCmd ?? null;
  if (configured && (await pathExists(configured))) return configured;

  const conventional = path.join(homedir, "work/dev/laconic-skill/tools/laconic_record.py");
  if (await pathExists(conventional)) return conventional;

  const plugin = await findInPluginCache(homedir);
  if (plugin) return plugin;

  return findOnPath(env.PATH);
}

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await fs.access(candidate, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function findOnPath(pathEnv: string | undefined): Promise<string | null> {
  for (const dir of (pathEnv ?? "").split(path.delimiter).filter((d) => d.length > 0)) {
    const candidate = path.join(dir, "laconic_record.py");
    if (await pathExists(candidate)) return candidate;
  }
  return null;
}

/**
 * Bounded three-level enumeration of `~/.claude/plugins/cache/<marketplace>/
 * <plugin>/<version>/tools/laconic_record.py` -- the layout this repo's own
 * plugin cache actually uses (verified by inspection, see module header),
 * so this is a fixed-depth directory read at each level, never an
 * open-ended recursive walk that could stall startup on a large cache.
 */
async function findInPluginCache(homedir: string): Promise<string | null> {
  const cacheRoot = path.join(homedir, ".claude/plugins/cache");
  for (const marketplace of await safeReaddir(cacheRoot)) {
    for (const plugin of await safeReaddir(path.join(cacheRoot, marketplace))) {
      for (const version of await safeReaddir(path.join(cacheRoot, marketplace, plugin))) {
        const candidate = path.join(
          cacheRoot,
          marketplace,
          plugin,
          version,
          "tools",
          "laconic_record.py",
        );
        if (await pathExists(candidate)) return candidate;
      }
    }
  }
  return null;
}

async function safeReaddir(dir: string): Promise<string[]> {
  try {
    return await fs.readdir(dir);
  } catch {
    return []; // missing/unreadable dir at any level -- just yields no candidates from that branch
  }
}
