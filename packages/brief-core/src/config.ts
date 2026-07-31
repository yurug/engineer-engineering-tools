// Module: config -- the generic `<stateDirName>/config.json` loading
// PATTERN: zod `.strict()`, unknown key -> E_CONFIG, missing file -> the
// caller's own default.
//
// Extracted from @backbrief/server's `store/config.ts` (ADR-001,
// kb/external/backbrief-internals.md: "Pattern reused for forebrief's
// config"). WHY the schema itself does NOT move: backbrief's config fields
// (`kbDir`, `excludes`, `maxFileBytes`, `laconic`...) are backbrief-domain;
// forebrief's config (`title`, `foldIn.{adrDir,roundsDir,template,idFormat}`)
// is a completely different shape. Only the MECHANISM -- read-or-default,
// parse, reject unknown keys loudly -- is shared; each consumer supplies its
// own zod schema and default value.
import * as fs from "node:fs/promises";
import type { z } from "zod";
import { AppError } from "@brief/shared";
import { resolveStateDirPath } from "./fsguard";

/**
 * @param repoRoot the host repo
 * @param stateDirName the consumer's own state directory name
 * @param relPath the config file's path relative to `<stateDirName>/` (conventionally "config.json")
 * @param schema a zod `.strict()` schema for the consumer's own config shape
 * @param defaultValue returned as-is if no config file exists at all
 * @returns the parsed config, or `defaultValue` if the file is missing
 * @throws {AppError} E_CONFIG if the file exists but is invalid JSON, fails
 *   the schema, or names an unknown key -- a config error must fail startup
 *   loudly rather than silently degrade
 */
export async function loadConfigFile<T>(
  repoRoot: string,
  stateDirName: string,
  relPath: string,
  schema: z.ZodType<T>,
  defaultValue: T,
): Promise<T> {
  let raw: string;
  try {
    raw = await fs.readFile(
      resolveStateDirPath(repoRoot, stateDirName, relPath),
      "utf8",
    );
  } catch {
    return defaultValue;
  }
  const parsed = schema.safeParse(safeJsonParse(raw));
  if (!parsed.success) {
    throw new AppError("E_CONFIG", `invalid ${stateDirName}/${relPath}`, {
      issues: parsed.error.issues,
    });
  }
  return parsed.data;
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    // Returned as-is to the schema, which will fail with a useful message
    // rather than this function throwing a raw SyntaxError past the
    // taxonomy boundary.
    return undefined;
  }
}
