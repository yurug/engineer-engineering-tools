// Module: laconic/home -- resolves ~/.laconic's location and the bridge's
// hard on/off short-circuit, per kb/spec/laconic-bridge.md's config block.
//
// Deliberately fs-free: this module only computes PATHS and the
// explicit-disable check, so it is trivially unit-testable without a
// filesystem. The "does concepts/ actually exist" check (the OTHER half of
// "is the bridge on") lives in read-snapshot.ts, next to the fs access it
// requires anyway (module header there explains why).
//
// `os.homedir()` is DELIBERATELY NOT called anywhere in this file (or
// anywhere else under laconic/) -- it is read exactly ONCE, at each real
// composition root (server.ts, digest.ts), and threaded through as a plain
// `homedir` string parameter. code-style.md's DI rule ("effects... enter
// through interfaces, passed explicitly") applies to `os.homedir()` just
// like `fs`/clock/randomness: a test that didn't inject it would silently
// resolve against whatever `$HOME` the test runner happens to have (this
// project's own dev box has a REAL ~/.laconic and ~/work/dev/laconic-skill
// -- a bug here could make a unit test pass by accident against real data,
// or, worse, a future integration test accidentally touch it).
import * as path from "node:path";
import type { Config } from "../store/config";

/**
 * The subset of `process.env` this bridge reads. Declared narrow and passed
 * explicitly (DI, code-style.md: "effects... enter through interfaces...
 * passed explicitly") rather than read from `process.env` inside this
 * module, so tests substitute a fake env without mutating the real process.
 * `process.env` itself satisfies this structurally at every real call site
 * (server.ts, digest.ts).
 */
export interface LaconicEnv {
  readonly LACONIC_HOME?: string;
  readonly PATH?: string;
}

/**
 * @param homedir the caller's `os.homedir()` (DI -- module header)
 * @returns the laconic home directory: `config.laconic.home`, else
 *   `$LACONIC_HOME`, else `~/.laconic` (laconic-bridge.md's config block --
 *   "home: null, // default: $LACONIC_HOME or ~/.laconic").
 */
export function resolveLaconicHome(config: Config, env: LaconicEnv, homedir: string): string {
  return config.laconic?.home ?? env.LACONIC_HOME ?? path.join(homedir, ".laconic");
}

/**
 * @returns true if `laconic.enabled: false` forces the bridge off, no
 *   matter what exists on disk at `home` -- an explicit "no" beats an
 *   auto-detected "yes". `null`/absent (auto) and `true` both return false
 *   here; the concepts/ existence check (read-snapshot.ts) still governs
 *   those two cases.
 */
export function isLaconicExplicitlyDisabled(config: Config): boolean {
  return config.laconic?.enabled === false;
}

/** The one path both read-snapshot.ts and the "is the bridge on" check consult. */
export function laconicConceptsDir(home: string): string {
  return path.join(home, "concepts");
}
