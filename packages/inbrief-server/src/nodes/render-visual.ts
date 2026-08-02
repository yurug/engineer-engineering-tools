// Module: nodes/render-visual -- validate and render a node's visual through
// @brief/primitives. Dynamic imports are the CJS server's safe ESM boundary.
import type { StoredVisual, VisualSubmission } from "../types/node";

export async function renderVisual(spec: VisualSubmission): Promise<StoredVisual> {
  if (spec.kind === "diagram") {
    // Variable keeps TypeScript's legacy Node10 resolver out of this genuine
    // ESM package boundary; Node resolves the exports map at runtime.
    const moduleName: string = "@brief/primitives/diagram";
    const renderer = (await import(moduleName)) as {
      renderDiagram(
        raw: unknown,
        options?: { chrome?: boolean },
      ): Promise<
        | { status: "ok"; svg: string }
        | { status: "skew"; svg: string }
        | { status: "invalid"; error: { message: string } }
      >;
    };
    // The Move card already supplies a boundary. A second grounded rectangle
    // carries no new trust information and visually dominates the diagram.
    const outcome = await renderer.renderDiagram(spec, { chrome: false });
    if (outcome.status === "ok") return { kind: "diagram", spec, svg: outcome.svg };
    return {
      kind: "invalid",
      spec,
      error: outcome.status === "invalid" ? outcome.error.message : "schema version mismatch",
    };
  }
  if (spec.kind === "filmstrip") {
    const moduleName: string = "@brief/primitives/filmstrip";
    const renderer = (await import(moduleName)) as {
      renderFilmstrip(
        raw: unknown,
        options?: { chrome?: boolean },
      ): Promise<
        | { status: "ok"; steps: { caption: string; svg: string }[] }
        | { status: "skew"; steps: { caption: string; svg: string }[] }
        | { status: "invalid"; error: { message: string } }
      >;
    };
    const outcome = await renderer.renderFilmstrip(spec, { chrome: false });
    if (outcome.status === "ok") return { kind: "filmstrip", spec, steps: outcome.steps };
    return {
      kind: "invalid",
      spec,
      error: outcome.status === "invalid" ? outcome.error.message : "schema version mismatch",
    };
  }
  return {
    kind: "invalid",
    spec,
    error: `unsupported primitive kind ${JSON.stringify(spec.kind)}`,
  };
}
