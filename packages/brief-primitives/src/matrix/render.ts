// Module: matrix/render -- spec -> built-DOM HTML string (kb/primitives/
// spec.md#4-trade-off-matrix's rendering path). Unlike diagram/filmstrip,
// this substrate needs no WASM layout engine (PR6: matrix is pure DOM), so
// rendering is synchronous and pure -- no `async`, no I/O.
//
// Trust chrome (ADR-011) has TWO layers here, both required by PR3:
//   1. An outer frame at the visual's WEAKEST claim -- same visual language
//      as trust-frame.ts's SVG frame (solid = grounded, dashed + corner tag
//      = conjecture), reimplemented for the DOM substrate directly from
//      TOKENS (tokens.ts's header: "three substrates never share a
//      rendering platform" -- trust-frame.ts's own implementation assumes
//      Graphviz-shaped SVG and cannot be reused byte-for-byte here).
//   2. The per-cell exception (ADR-011, the one substrate where per-element
//      marking is cheap): a cell whose OWN `trust` is "conjecture" carries
//      a `data-trust="conjecture"` marker and a distinct style, independent
//      of what the outer frame shows.
import { checkSchemaVersion, PRIMITIVES_SCHEMA_VERSION } from "../version.js";
import { renderSkewBanner } from "../skew-banner.js";
import { PrimitiveSchemaError } from "../schema-error.js";
import { TOKENS } from "../tokens.js";
import type { Trust } from "../envelope.js";
import {
  MatrixSpecSchema,
  type MatrixCell,
  type MatrixOption,
  type MatrixSpec,
} from "./spec.js";
import { escapeHtmlText } from "./html-utils.js";

export type MatrixRenderOutcome =
  | { status: "ok"; html: string }
  | { status: "skew"; html: string }
  | { status: "invalid"; error: PrimitiveSchemaError };

function versionOf(raw: unknown): string | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const version = (raw as Record<string, unknown>).schemaVersion;
  return typeof version === "string" ? version : undefined;
}

/**
 * PR3's per-cell exception, folded into the whole-visual verdict: the outer
 * frame renders "conjecture" if the envelope says so OR if ANY declared
 * cell does -- ADR-011: "a matrix whose frame is grounded but which
 * contains a conjecture cell must still render the whole-visual frame at
 * the weakest claim." A cell with no `trust` field contributes nothing (it
 * makes no claim either way).
 */
function weakestTrust(spec: MatrixSpec): Trust {
  if (spec.trust === "conjecture") return "conjecture";
  for (const row of Object.values(spec.cells)) {
    for (const cell of Object.values(row)) {
      if (cell.trust === "conjecture") return "conjecture";
    }
  }
  return "grounded";
}

/** @returns one `<td>` -- an explicit dash (never blank) when `spec.cells`
 *  has no entry for this option/criterion pair (kb/primitives/spec.md:
 *  "an unstated trade-off is information"). */
function renderCell(
  spec: MatrixSpec,
  optionKey: string,
  criterionKey: string,
): string {
  const cell: MatrixCell | undefined = spec.cells[optionKey]?.[criterionKey];
  if (!cell) {
    return `<td class="backbrief-matrix-cell backbrief-matrix-cell--missing" aria-label="no stated trade-off">—</td>`;
  }
  const conjecture = cell.trust === "conjecture";
  const trustAttr = cell.trust ? ` data-trust="${cell.trust}"` : "";
  const cellClass = `backbrief-matrix-cell${conjecture ? " backbrief-matrix-cell--conjecture" : ""}`;
  return `<td class="${cellClass}"${trustAttr}>${escapeHtmlText(cell.text)}</td>`;
}

function renderHeaderRow(spec: MatrixSpec): string {
  const headers = spec.criteria
    .map((c) => `<th scope="col">${escapeHtmlText(c.label)}</th>`)
    .join("");
  return `<tr><th scope="col" class="backbrief-matrix-corner"></th>${headers}</tr>`;
}

function renderOptionRow(spec: MatrixSpec, option: MatrixOption): string {
  const isRecommended = spec.recommended === option.key;
  const marker = isRecommended
    ? ` <span class="backbrief-matrix-recommended">recommended</span>`
    : "";
  const cells = spec.criteria
    .map((c) => renderCell(spec, option.key, c.key))
    .join("");
  return `<tr><th scope="row">${escapeHtmlText(option.label)}${marker}</th>${cells}</tr>`;
}

/**
 * @invariant PR2 -- every spec-provided string (label, cell text) passes
 *   through escapeHtmlText before entering the returned markup; nothing is
 *   ever interpolated raw.
 * @invariant PR9 -- a pure function of `spec`'s content: the same spec
 *   renders byte-identical HTML on every call (no ids, no timestamps).
 */
export function renderMatrixBody(spec: MatrixSpec): string {
  const trust = weakestTrust(spec);
  const isConjecture = trust === "conjecture";
  const frameColor = isConjecture ? TOKENS.color.conjecture : TOKENS.color.ink;
  const frameStyle = [
    `border:${TOKENS.stroke.frameWidth}px ${isConjecture ? "dashed" : "solid"} ${frameColor}`,
    `padding:${TOKENS.space.frameInset}px`,
    `font-family:${TOKENS.font.family}`,
    `color:${TOKENS.color.ink}`,
    `display:inline-block`,
  ].join(";");
  const cornerTag = isConjecture
    ? `<div class="backbrief-matrix-corner-tag" style="color:${TOKENS.color.conjecture};font-size:${TOKENS.font.size}px;text-align:right">CONJECTURE</div>`
    : "";
  const rows = spec.options.map((o) => renderOptionRow(spec, o)).join("");
  return [
    // PR8b: the matrix builds its own DOM frame rather than going through
    // wrapWithTrustFrame (which is SVG-only), so it needs the provenance stamp
    // in its own right — found when the first real matrix rendered without one
    // and the adoption metric could not see it.
    `<div class="backbrief-matrix-frame" data-trust="${trust}" data-primitive="matrix" data-primitives-version="${PRIMITIVES_SCHEMA_VERSION}" style="${frameStyle}">`,
    `<!-- rendered by @brief/primitives from a validated matrix spec -->`,
    cornerTag,
    `<table class="backbrief-matrix">`,
    `<thead>${renderHeaderRow(spec)}</thead>`,
    `<tbody>${rows}</tbody>`,
    `</table>`,
    `</div>`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * @param raw an untrusted parsed-JSON value.
 * @invariant PR5 -- a schemaVersion mismatch returns `{status:"skew"}` with
 *   the rendered banner (reused verbatim from ../skew-banner.ts -- an SVG
 *   fragment is valid, embeddable markup inside this substrate's HTML, so
 *   the same banner serves every renderer without duplication).
 * @invariant PR7 -- an invalid spec returns `{status:"invalid"}` whose
 *   `error.message` names the failing field path.
 */
export function renderMatrix(raw: unknown): MatrixRenderOutcome {
  const specVersion = versionOf(raw);
  if (specVersion !== undefined) {
    const versionCheck = checkSchemaVersion(specVersion);
    if (!versionCheck.ok)
      return { status: "skew", html: renderSkewBanner(versionCheck) };
  }
  const parsed = MatrixSpecSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      status: "invalid",
      error: new PrimitiveSchemaError(
        "malformed matrix spec",
        parsed.error.issues,
      ),
    };
  }
  return { status: "ok", html: renderMatrixBody(parsed.data) };
}
