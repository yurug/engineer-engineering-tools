// Module: citation-walk -- generic citation discovery over any parsed
// action/event, used by both minting (POST /api/actions) and validation
// (server/validate).
//
// data-model.md#citation-locations is explicit: "citations appear in refs
// AND in the citation-typed payload fields enumerated by the zod schemas...
// Validation walks ALL of them -- schema-driven, so an unvalidated citation
// location cannot exist by construction." A hand-maintained list of "the
// payload fields that hold citations" is exactly the kind of list that
// drifts the moment a new action type ships. Instead, this module walks the
// ALREADY-ZOD-PARSED value structurally and finds every object literal that
// looks like a Citation (`{kind: "code"|"kb", ...}`) wherever it is nested
// -- in `refs`, in `payload.citation`, inside a DiagramSpec's nodes/edges,
// inside a nested Card's own `refs`. Adding a new citation-bearing field to
// a schema requires no change here: the walker finds it automatically.
// Key design decision: this module is pure (no I/O) -- minting's actual
// content resolution (reading a file, running `git show`) is injected by
// the caller (server/validate) as a callback, keeping `shared` free of fs/git.
import type { Citation, CitationInput } from "./citation";

/** A found citation slot: readable and (for minting) replaceable in place. */
export interface CitationSlot {
  get(): CitationInput;
  set(next: Citation): void;
}

function isCitationLike(v: unknown): v is CitationInput {
  if (!v || typeof v !== "object") return false;
  const kind = (v as Record<string, unknown>)["kind"];
  return kind === "code" || kind === "kb";
}

/**
 * Recursively walks `value` (an already-parsed action/event, or any
 * sub-object of one) and invokes `onFound` once per citation slot
 * encountered, in a stable depth-first order.
 * @param value the parsed envelope-ish object, or any nested value -- the
 *   function recurses into plain objects and arrays only, so it cannot
 *   wander into unrelated prototypes or class instances
 * @param onFound called once per discovered citation, with a slot that can
 *   both read the current value and (for minting) overwrite it in place
 * @invariant P1 every citation location the zod schemas can produce is
 *   found here -- proven by the property-based test that generates random
 *   action/event payloads and asserts every embedded citation is visited
 */
export function walkCitations(value: unknown, onFound: (slot: CitationSlot) => void): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      if (isCitationLike(item)) {
        onFound({
          get: () => value[index] as CitationInput,
          set: (next) => {
            value[index] = next;
          },
        });
      } else {
        walkCitations(item, onFound);
      }
    });
    return;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      const child = record[key];
      if (isCitationLike(child)) {
        onFound({
          get: () => child,
          set: (next) => {
            record[key] = next;
          },
        });
      } else {
        walkCitations(child, onFound);
      }
    }
  }
}

/** @returns every citation reachable from `value`, in the walker's stable order. */
export function collectCitationInputs(value: unknown): CitationInput[] {
  const found: CitationInput[] = [];
  walkCitations(value, (slot) => found.push(slot.get()));
  return found;
}

/**
 * Mints every CodeCitation found under `value` by replacing it in place
 * with the result of `mint`. KbCitations are left untouched (data-model.md:
 * they need no minting -- no hash, no rev). Order is the walker's stable
 * depth-first order, but each mint is awaited sequentially rather than via
 * `Promise.all` -- deliberately: minting shells out to git per citation
 * (server/repo), and NF2's "50-citation action < 1s" budget is met by
 * git's own speed, not by fan-out concurrency that would multiply
 * concurrent child-process spawns for no measured benefit at MVP scale.
 * @param value the parsed action/event to mint in place (mutated)
 * @param mint resolves a submitted CodeCitationInput to its canonical,
 *   hashed CodeCitation -- injected so this module stays I/O-free
 * @invariant NF4 the agent never computes a hash; this is the mint step
 *   that makes that true
 */
export async function mintCodeCitations(
  value: unknown,
  mint: (input: Extract<CitationInput, { kind: "code" }>) => Promise<Citation>,
): Promise<void> {
  const slots: CitationSlot[] = [];
  walkCitations(value, (slot) => slots.push(slot));
  for (const slot of slots) {
    const current = slot.get();
    if (current.kind === "code") {
      slot.set(await mint(current));
    }
  }
}
