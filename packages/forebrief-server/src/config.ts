// Module: config -- `.forebrief/config.json` loading.
//
// Implements kb/spec/config-and-formats.md#configjson. Only `title` (the
// default session title) is consulted by plan step 1; `foldIn.*` is parsed
// and validated now (so a config.json written today survives into step 4
// unchanged) but not enforced until fold-in exists.
// Key design decision: unknown keys are rejected (E_CONFIG) via zod
// `.strict()`, the same pattern @brief/core's `loadConfigFile`
// implements generically (ADR-001) -- this file supplies forebrief's OWN
// schema/defaults, the one part of the pattern that is NOT shared (backbrief's
// config shape -- kbDir/excludes/maxFileBytes/laconic -- has nothing to do
// with forebrief's fold-in config).
import { z } from "zod";
import { loadConfigFile } from "@brief/core";

const STATE_DIR = ".forebrief";
const CONFIG_RELATIVE_PATH = "config.json";

const FoldInConfigSchema = z
  .object({
    adrDir: z.string().default("kb/architecture/decisions"),
    roundsDir: z.string().default("kb"),
    template: z.string().default("default"),
    idFormat: z.string().default("ADR-%03d"),
    // Dogfooding gap 1 (2026-07-26): folded frontmatter used to hardcode
    // `domain: forebrief` and `related: [functional-properties]` -- ids from
    // forebrief's OWN kb vocabulary, so every folded file failed a host repo's
    // lint until hand-edited. `domain` is now declared here; `related` is gone
    // (the author adds one if their lint wants it).
    domain: z.string().default("decisions"),
  })
  .strict();
export type FoldInConfig = z.infer<typeof FoldInConfigSchema>;
const DEFAULT_FOLD_IN: FoldInConfig = FoldInConfigSchema.parse({});

const ConfigSchema = z
  .object({
    title: z.string().nullable().default(null),
    foldIn: FoldInConfigSchema.default(DEFAULT_FOLD_IN),
  })
  .strict();
export type Config = z.infer<typeof ConfigSchema>;

const DEFAULT_CONFIG: Config = ConfigSchema.parse({});

/**
 * @returns the parsed config, or `DEFAULT_CONFIG` if no config.json exists
 * @throws {AppError} E_CONFIG if the file exists but is invalid JSON, fails
 *   the schema, or names an unknown key
 * @invariant P3 the config path is resolved through fsguard by
 *   `loadConfigFile` itself
 */
export async function loadConfig(repoRoot: string): Promise<Config> {
  return loadConfigFile(repoRoot, STATE_DIR, CONFIG_RELATIVE_PATH, ConfigSchema, DEFAULT_CONFIG);
}
