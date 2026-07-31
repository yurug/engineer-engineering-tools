// Module: claim/render -- ClaimSpec -> a DOM card embedding its evidence
// (kb/primitives/spec.md#5-assertion-evidence-card). Built DOM, like
// ../matrix/render.ts -- no library, synchronous composition once the
// (possibly async) evidence markup is in hand.
//
// PR3, THIS STEP'S COMPOSITION RULE: "the OUTER frame owning trust at the
// weakest claim across card and evidence." The card reads the evidence
// spec's own DECLARED envelope `trust` and takes the weaker of that and
// the claim's own `spec.trust` (ADR-011: "a visual mixing validated and
// predicted claims takes the weakest").
//
// WHETHER THE EVIDENCE ALSO DRAWS ITS OWN FRAME (revised 2026-07-29,
// ./dispatch.ts's `evidenceDrawsOwnChrome`). It used to, unconditionally,
// and the reason given was that the outer frame cannot re-derive a
// matrix's per-cell nuance. That reason is sound -- for a matrix. It does
// not reach the three SVG kinds, whose frame carries whole-visual trust
// and nothing else, so a conjecture chart inside a conjecture card drew
// two dashed rectangles and two CONJECTURE tags for one claim, which is
// the element-carrying-no-information P-D deletes. Now: a matrix always
// keeps its frame; an SVG kind keeps its frame only when its trust
// DIFFERS from the card's, where it says something the outer frame (pinned
// to the weaker level) cannot. Suppressing chrome never suppresses the
// `data-trust` attribute or the provenance stamp -- dropping the stamp
// with the rectangle would recreate exactly the blind spot PR8b names.
import { checkSchemaVersion, PRIMITIVES_SCHEMA_VERSION } from "../version.js";
import { renderSkewBanner } from "../skew-banner.js";
import { PrimitiveSchemaError } from "../schema-error.js";
import { TOKENS } from "../tokens.js";
import type { Trust } from "../envelope.js";
import {
  ClaimSpecSchema,
  type ClaimSpec,
  type EvidenceEnvelope,
} from "./spec.js";
import {
  renderEvidence,
  prefixIssuesWithEvidence,
  evidenceDrawsOwnChrome,
} from "./dispatch.js";
import { escapeHtmlText } from "./html-utils.js";

export type ClaimRenderOutcome =
  | { status: "ok"; html: string }
  | { status: "skew"; html: string }
  | { status: "invalid"; error: PrimitiveSchemaError };

function versionOf(raw: unknown): string | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const version = (raw as Record<string, unknown>).schemaVersion;
  return typeof version === "string" ? version : undefined;
}

function weakestOf(a: Trust, b: Trust): Trust {
  return a === "conjecture" || b === "conjecture" ? "conjecture" : "grounded";
}

/** The evidence's own declared trust -- safe to read now: dispatch only
 *  reaches this point after the evidence's FULL kind-specific schema
 *  (which always includes `envelopeFields.trust`) has already validated
 *  it successfully. */
function evidenceTrustOf(evidence: EvidenceEnvelope): Trust {
  return evidence.trust === "conjecture" ? "conjecture" : "grounded";
}

/**
 * @invariant PR2 -- `assertion`/`caveat` pass through `escapeHtmlText`;
 *   `evidenceMarkup` is NOT re-escaped here because it is already-rendered
 *   trusted output from another primitive's own renderer, not a raw spec
 *   field (the same composition trust every primitive-to-primitive
 *   embedding in this package relies on).
 */
function renderClaimCard(
  spec: ClaimSpec,
  evidenceMarkup: string,
  trust: Trust,
): string {
  const isConjecture = trust === "conjecture";
  const frameColor = isConjecture ? TOKENS.color.conjecture : TOKENS.color.ink;
  const frameStyle = [
    `border:${TOKENS.stroke.frameWidth}px ${isConjecture ? "dashed" : "solid"} ${frameColor}`,
    `padding:${TOKENS.space.frameInset}px`,
    `font-family:${TOKENS.font.family}`,
    `color:${TOKENS.color.ink}`,
    `display:inline-block`,
    // A card narrower than its container shrink-wraps its evidence; a card
    // WIDER than it used to overflow and clip, silently. Found rendering
    // the first chart: its rightmost data point sat outside the window and
    // could only be seen by resizing the browser. Data a reader cannot
    // reach is data the visual does not carry.
    `max-width:100%`,
    `box-sizing:border-box`,
  ].join(";");
  const cornerTag = isConjecture
    ? `<div class="backbrief-claim-corner-tag" style="color:${TOKENS.color.conjecture};font-size:${TOKENS.font.size}px;text-align:right">CONJECTURE</div>`
    : "";
  const caveatBlock = spec.caveat
    ? `<div class="backbrief-claim-caveat" style="color:${TOKENS.color.inkMuted};font-size:${TOKENS.font.size}px">${escapeHtmlText(spec.caveat)}</div>`
    : "";
  return [
    // PR8b, third frame implementation. The lesson was written after the matrix
    // needed its own stamp ("a property that holds 'in the frame' holds once per
    // frame implementation, not once") and this one was still missing it — the
    // sweep the lesson called for never happened. A claim card whose evidence is
    // a stamped matrix passes file-level detection anyway, which is exactly how
    // this stayed invisible.
    `<div class="backbrief-claim-frame" data-trust="${trust}" data-primitive="claim" data-primitives-version="${PRIMITIVES_SCHEMA_VERSION}" style="${frameStyle}">`,
    `<!-- rendered by @brief/primitives from a validated claim spec -->`,
    cornerTag,
    // P-F: the headline IS the assertion, styled as such (never a
    // topic-phrase-shaped caption) -- font-size/weight follow this
    // primitive's own P-C "label sits on the thing it labels" intent by
    // sitting directly above the evidence it asserts about.
    `<div class="backbrief-claim-assertion" style="font-size:${String(TOKENS.font.sizeTitle)}px;font-weight:bold">${escapeHtmlText(spec.assertion)}</div>`,
    // The evidence scrolls rather than clips when it cannot shrink: an SVG
    // has an intrinsic width the card cannot reflow, so the only honest
    // choices are "scroll it" or "lose part of it".
    `<div class="backbrief-claim-evidence" style="overflow-x:auto">${evidenceMarkup}</div>`,
    caveatBlock,
    `</div>`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * @param raw an untrusted parsed-JSON value.
 * @invariant PR5 -- a schemaVersion mismatch returns `{status:"skew"}`,
 *   checked before shape validation and before any evidence dispatch.
 * @invariant PR7 -- a malformed OUTER spec (assertion/evidence.kind/
 *   caveat) fails at its own path; a malformed EVIDENCE spec fails with
 *   its path prefixed `evidence.` (`prefixIssuesWithEvidence`).
 * @invariant PR3 -- the returned card's outer frame is `conjecture`
 *   whenever EITHER the claim's own `trust` or its evidence's `trust` is.
 */
export async function renderClaim(raw: unknown): Promise<ClaimRenderOutcome> {
  const specVersion = versionOf(raw);
  if (specVersion !== undefined) {
    const versionCheck = checkSchemaVersion(specVersion);
    if (!versionCheck.ok)
      return { status: "skew", html: renderSkewBanner(versionCheck) };
  }
  const parsed = ClaimSpecSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      status: "invalid",
      error: new PrimitiveSchemaError(
        "malformed claim spec",
        parsed.error.issues,
      ),
    };
  }
  const spec = parsed.data;
  // The trust is computed BEFORE dispatch now, because the evidence needs
  // to know it to decide whether to draw its own chrome. Reading
  // `evidence.trust` this early is safe for that ONE purpose: if the
  // evidence turns out malformed, dispatch fails and nothing renders, so a
  // garbage trust value can only ever affect markup that is discarded.
  const trust = weakestOf(spec.trust, evidenceTrustOf(spec.evidence));
  const evidenceResult = await renderEvidence(spec.evidence, {
    chrome: evidenceDrawsOwnChrome(
      spec.evidence.kind,
      evidenceTrustOf(spec.evidence),
      trust,
    ),
  });
  if (!evidenceResult.ok) {
    return {
      status: "invalid",
      error: new PrimitiveSchemaError(
        "malformed claim evidence",
        prefixIssuesWithEvidence(evidenceResult.error.issues),
      ),
    };
  }
  return {
    status: "ok",
    html: renderClaimCard(spec, evidenceResult.value.markup, trust),
  };
}
