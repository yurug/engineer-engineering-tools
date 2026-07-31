// Module: diagram/render -- spec -> DOT -> Graphviz WASM -> SVG -> trust
// frame (kb/primitives/spec.md#1-diagram's rendering path, end to end).
import { checkSchemaVersion, PRIMITIVES_SCHEMA_VERSION } from "../version.js";
import { renderSkewBanner } from "../skew-banner.js";
import { wrapWithTrustFrame, type EmbedOptions } from "../trust-frame.js";
import { PrimitiveSchemaError } from "../schema-error.js";
import {
  DiagramSpecSchema,
  type DiagramBody,
  type DiagramSpec,
} from "./spec.js";
import { ENGINE_BY_MEANING } from "./engine-map.js";
import { buildDot } from "./dot.js";
import { layoutDot } from "./graphviz-instance.js";

export type DiagramRenderOutcome =
  | { status: "ok"; svg: string }
  | { status: "skew"; svg: string }
  | { status: "invalid"; error: PrimitiveSchemaError };

/**
 * Renders an already-shape-validated diagram body to a raw (un-framed)
 * SVG string. Exposed separately from `renderDiagram` because
 * ./filmstrip's base layout is validated by `FilmstripSpecSchema` (its
 * `base` field has no envelope of its own -- see ./spec.ts's KB-drift
 * note) and must not be re-validated against `DiagramSpecSchema`, which
 * requires envelope fields the filmstrip body doesn't carry.
 *
 * @invariant PR9 -- a pure function of `body`'s content: the same body
 *   renders byte-identical SVG on every call (Graphviz's own determinism).
 */
export async function renderDiagramBody(
  body: Pick<DiagramBody, "meaning" | "nodes" | "edges">,
): Promise<string> {
  const engine = ENGINE_BY_MEANING[body.meaning];
  const dot = buildDot(body, engine);
  return layoutDot(dot, engine);
}

function versionOf(raw: unknown): string | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const version = (raw as Record<string, unknown>).schemaVersion;
  return typeof version === "string" ? version : undefined;
}

/**
 * @param raw an untrusted parsed-JSON value.
 * @invariant PR5 -- a schemaVersion mismatch returns `{status:"skew"}`
 *   with the rendered banner; shape validation never runs against a spec
 *   version this build doesn't implement (an old/new schema might
 *   disagree on what's valid, so checking shape first would misreport
 *   "malformed" for what is really "renderer out of date").
 * @invariant PR7 -- an invalid spec returns `{status:"invalid"}` whose
 *   `error.message` names the failing field path.
 */
export async function renderDiagram(
  raw: unknown,
  options: EmbedOptions = {},
): Promise<DiagramRenderOutcome> {
  const specVersion = versionOf(raw);
  if (specVersion !== undefined) {
    const versionCheck = checkSchemaVersion(specVersion);
    if (!versionCheck.ok)
      return { status: "skew", svg: renderSkewBanner(versionCheck) };
  }
  const parsed = DiagramSpecSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      status: "invalid",
      error: new PrimitiveSchemaError(
        "malformed diagram spec",
        parsed.error.issues,
      ),
    };
  }
  const spec: DiagramSpec = parsed.data;
  const rawSvg = await renderDiagramBody(spec);
  return {
    status: "ok",
    svg: wrapWithTrustFrame(rawSvg, spec.trust, {
      primitive: "diagram",
      schemaVersion: PRIMITIVES_SCHEMA_VERSION,
      ...options,
    }),
  };
}
