// Module: filmstrip/stepper -- P-E's "reader paces the segments": a
// minimal, framework-free stepper exposing next()/previous()/goTo() plus
// the headless per-step data ./render.ts already produces. No animation,
// no auto-advance timer (kb/primitives/scope.md: "Interactivity beyond
// the filmstrip's step advance" is explicitly out of scope beyond this).
//
// Duck-typed target (`{ innerHTML: string }`) rather than a `HTMLElement`
// parameter: this package's tsconfig has no "DOM" lib entry (it may run
// in Node, e.g. to pre-render a tour's SVGs), so a real DOM element still
// satisfies this shape structurally in a browser, and a plain test object
// satisfies it here without pulling in jsdom.
export interface FilmstripStepperTarget {
  innerHTML: string;
}

export interface FilmstripStepper {
  readonly stepIndex: number;
  readonly stepCount: number;
  readonly caption: string;
  next(): void;
  previous(): void;
  goTo(index: number): void;
}

/**
 * @param target where the current step's SVG markup is written.
 * @param steps the rendered output of `renderFilmstripSteps` (or any
 *   equivalent `{svg, caption}` list) -- already trust-framed.
 * @throws if `steps` is empty.
 */
export function createFilmstripStepper(
  target: FilmstripStepperTarget,
  steps: readonly { svg: string; caption: string }[],
): FilmstripStepper {
  if (steps.length === 0)
    throw new Error("createFilmstripStepper: no steps to show");
  let index = 0;
  const render = (): void => {
    target.innerHTML = steps[index]!.svg;
  };
  render();
  return {
    get stepIndex() {
      return index;
    },
    get stepCount() {
      return steps.length;
    },
    get caption() {
      return steps[index]!.caption;
    },
    next(): void {
      if (index < steps.length - 1) {
        index += 1;
        render();
      }
    },
    previous(): void {
      if (index > 0) {
        index -= 1;
        render();
      }
    },
    goTo(newIndex: number): void {
      if (newIndex < 0 || newIndex >= steps.length) {
        throw new Error(`goTo: index ${String(newIndex)} out of range`);
      }
      index = newIndex;
      render();
    },
  };
}
