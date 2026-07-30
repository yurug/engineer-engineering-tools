// Module: store/config -- backbrief's own `.backbrief/config.json` schema,
// loaded through @brief/core's generic loading MECHANISM (ADR-001:
// "Pattern reused for forebrief's config" -- only the pattern moved; this
// schema is backbrief-domain and stays here).
// Implements kb/spec/config-and-formats.md#configjson.
import { z } from "zod";
import { loadConfigFile } from "@brief/core";

const STATE_DIR = ".backbrief";
const CONFIG_RELATIVE_PATH = "config.json";

// kb/spec/laconic-bridge.md's config block: every field null = fully auto
// (enabled iff `<home>/concepts/` exists; home = $LACONIC_HOME or
// ~/.laconic; recordCmd auto-discovered -- server/src/laconic/home.ts and
// discover-record-cmd.ts do the actual resolution, this schema only pins
// the on-disk shape). `enabled: false` forces the bridge fully off
// regardless of what's on disk at `home`.
const LaconicConfigSchema = z
  .object({
    enabled: z.boolean().nullable().default(null),
    home: z.string().nullable().default(null),
    recordCmd: z.string().nullable().default(null),
  })
  .strict();
export type LaconicConfig = z.infer<typeof LaconicConfigSchema>;

const ConfigSchema = z
  .object({
    version: z.literal(1),
    kbDir: z.string().nullable().default("kb"),
    excludes: z.array(z.string()).default(["node_modules/**", "_build/**", "target/**", "dist/**"]),
    maxFileBytes: z.number().int().positive().default(1_048_576),
    port: z.number().int().positive().nullable().default(null),
    laconic: LaconicConfigSchema.nullable().default(null),
  })
  .strict();
export type Config = z.infer<typeof ConfigSchema>;

const DEFAULT_CONFIG: Config = ConfigSchema.parse({ version: 1 });

/**
 * @returns the parsed config, or `DEFAULT_CONFIG` if no config.json exists
 * @throws {AppError} E_CONFIG if the file exists but is invalid JSON, fails
 *   the schema, or names an unknown key
 */
export async function loadConfig(repoRoot: string): Promise<Config> {
  return loadConfigFile(repoRoot, STATE_DIR, CONFIG_RELATIVE_PATH, ConfigSchema, DEFAULT_CONFIG);
}
