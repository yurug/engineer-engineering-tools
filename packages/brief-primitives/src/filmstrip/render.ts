// Module: filmstrip/render -- FilmstripSpec -> N per-step SVGs
// (kb/primitives/spec.md#2-filmstrip). One base layout (./layout.ts) is
// rendered once; every step's SVG derives from it via ./step-render.ts
// alone -- Graphviz's `layoutDot` runs exactly once per filmstrip
// regardless of step count, which is what makes PR1 hold structurally
// rather than by coincidence.
import { checkSchemaVersion, PRIMITIVES_SCHEMA_VERSION } from "../version.js";
import { renderSkewBanner } from "../skew-banner.js";
import { wrapWithTrustFrame, type EmbedOptions } from "../trust-frame.js";
import { PrimitiveSchemaError } from "../schema-error.js";
import { FilmstripSpecSchema, edgeId, type FilmstripSpec } from "./spec.js";
import { buildFilmstripLayout } from "./layout.js";
import { renderFilmstripStep } from "./step-render.js";

export interface FilmstripStepOutput {
  caption: string;
  svg: string;
}

export type FilmstripRenderOutcome =
  | { status: "ok"; steps: FilmstripStepOutput[] }
  | { status: "skew"; svg: string }
  | { status: "invalid"; error: PrimitiveSchemaError };

/** id -> the base's own true label/edge-label -- the text a step
 *  displays when it does not override that id. */
function trueTextById(spec: Pick<FilmstripSpec, "base">): Map<string, string> {
  const map = new Map<string, string>();
  for (const node of spec.base.nodes) map.set(node.id, node.label);
  for (const edge of spec.base.edges) if (edge.label) map.set(edgeId(edge), edge.label);
  return map;
}

/**
 * Renders every step of an already-validated `FilmstripSpec`.
 * @invariant PR1 -- `buildFilmstripLayout` calls Graphviz exactly once;
 *   every step below only rewrites style/text on a fresh copy of that one
 *   render's SVG string.
 * @invariant PR9 -- a pure function of `spec`'s content.
 */
export async function renderFilmstripSteps(
  spec: FilmstripSpec,
  options: EmbedOptions = {},
): Promise<FilmstripStepOutput[]> {
  const { pinnedSvg } = await buildFilmstripLayout(spec.base, spec.steps);
  const baseText = trueTextById(spec);
  return spec.steps.map((step) => {
    const textForId = new Map(baseText);
    for (const [id, text] of Object.entries(step.labels ?? {})) textForId.set(id, text);
    const stepSvg = renderFilmstripStep(pinnedSvg, step, textForId);
    return {
      caption: step.caption,
      svg: wrapWithTrustFrame(stepSvg, spec.trust, {
        primitive: "filmstrip",
        schemaVersion: PRIMITIVES_SCHEMA_VERSION,
        ...options,
      }),
    };
  });
}

function versionOf(raw: unknown): string | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const version = (raw as Record<string, unknown>).schemaVersion;
  return typeof version === "string" ? version : undefined;
}

/**
 * @param raw an untrusted parsed-JSON value.
 * @invariant PR5 -- a schemaVersion mismatch returns `{status:"skew"}`
 *   with the rendered banner, checked before shape validation.
 * @invariant PR7 -- an invalid spec returns `{status:"invalid"}` whose
 *   `error.message` names the failing field path.
 */
export async function renderFilmstrip(
  raw: unknown,
  options: EmbedOptions = {},
): Promise<FilmstripRenderOutcome> {
  const specVersion = versionOf(raw);
  if (specVersion !== undefined) {
    const versionCheck = checkSchemaVersion(specVersion);
    if (!versionCheck.ok) return { status: "skew", svg: renderSkewBanner(versionCheck) };
  }
  const parsed = FilmstripSpecSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      status: "invalid",
      error: new PrimitiveSchemaError("malformed filmstrip spec", parsed.error.issues),
    };
  }
  const steps = await renderFilmstripSteps(parsed.data, options);
  return { status: "ok", steps };
}
