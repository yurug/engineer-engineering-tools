// Module: digest-laconic-section -- renders the digest's "What the reader
// already knows (laconic)" section (kb/spec/laconic-bridge.md#read).
//
// Split out for the same reason digest-map-section.ts is: keeps digest.ts
// itself under its size budget, and reuses digest.ts's own
// `renderSection`/NF5 truncation behavior instead of reimplementing it.
// Unlike the "Comprehension map" section (always rendered, even zeroed),
// THIS section is omitted from the digest entirely when the bridge is off
// -- digest.ts only calls this function when `readLaconicSnapshot` returned
// non-null (laconic-bridge.md: "No ~/.laconic -> bridge silent, no digest
// section").
import {
  readLaconicSnapshot,
  type LaconicConceptRef,
  type LaconicSnapshot,
} from "./laconic/read-snapshot";
import { discoverLaconicRecordCmd } from "./laconic/discover-record-cmd";
import type { Config } from "./store/config";
import { renderSection } from "./digest";

export interface LaconicDigestData {
  snapshot: LaconicSnapshot | null;
  writeAvailable: boolean;
}

/**
 * Fetches everything `renderLaconicSection` needs -- kept here rather than
 * inline in `generateDigest` (digest.ts) purely to keep that function's own
 * body under code-style.md's size budget; this section's fetch+render are a
 * cohesive, self-contained step either way.
 */
export async function loadLaconicDigestData(
  config: Config,
  env: NodeJS.ProcessEnv,
  homedir: string,
): Promise<LaconicDigestData> {
  const snapshot = await readLaconicSnapshot(config, env, homedir);
  const writeAvailable =
    snapshot !== null && (await discoverLaconicRecordCmd(config, env, homedir)) !== null;
  return { snapshot, writeAvailable };
}

/**
 * @param writeAvailable whether a `recordCmd` resolved -- laconic-bridge.md:
 *   "If recordCmd missing -> read-only; a one-line digest note that
 *   write-back is off."
 */
export function renderLaconicSection(snapshot: LaconicSnapshot, writeAvailable: boolean): string[] {
  return [
    "## What the reader already knows (laconic)",
    "",
    ...(writeAvailable
      ? []
      : ["_write-back is off (laconic_record.py not found) -- read-only calibration._", ""]),
    `### Verified (${String(snapshot.verified.length)}) -- use freely, never define`,
    "",
    ...renderGroupedByDomain(snapshot.verified),
    "",
    `### Familiar (${String(snapshot.familiar.length)}) -- a brief gloss is fine`,
    "",
    ...renderGroupedByDomain(snapshot.familiar),
  ];
}

/** One digest line per domain (not per concept) -- keeps the section compact even with many concepts, respecting NF5 without a second truncation mechanism (renderSection's own MAX_ITEMS_PER_SECTION caps the DOMAIN count; enforceHardCap is the final backstop, same as every other section). */
function renderGroupedByDomain(concepts: readonly LaconicConceptRef[]): string[] {
  if (concepts.length === 0) return ["_None._"];
  const byDomain = new Map<string, string[]>();
  for (const c of concepts) {
    const ids = byDomain.get(c.domain) ?? [];
    ids.push(c.id);
    byDomain.set(c.domain, ids);
  }
  const domains = [...byDomain.keys()].sort();
  return renderSection(
    domains,
    (domain) => `- **${domain}**: ${(byDomain.get(domain) ?? []).sort().join(", ")}`,
  );
}
