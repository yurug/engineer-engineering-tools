// Component: MemoryGraphCard -- renders a MemoryGraph ("what does the
// store look like now?", kb/spec/visual-devices.md).
//
// NOT a stepper (memory is a static snapshot, unlike trace/state-machine --
// visual-devices.md's "Dynamic devices... never autoplay" names only trace
// and state-machine). Used in TWO places: as `present_move`'s own top-level
// device (DeviceCard.tsx computes its own cell alignment), and embedded
// inside an ExecutionTrace frame (ExecutionTraceCard.tsx passes the SAME
// per-frame-aligned cell states through, so this component never needs to
// know which context it's in -- it just renders cells + their already-
// resolved states, kb/conventions/code-style.md's DI-flavored "pure
// presentational component" shape).
import type { MemoryGraph } from "@backbrief/shared/browser";
import type { ValidationState } from "@backbrief/shared/browser";
import { citationView } from "../lib/citation-view";

export function MemoryGraphCard({
  device,
  cellStates,
}: {
  device: MemoryGraph;
  /** Aligned 1:1 with `device.cells[]` by index (lib/device-validation.ts). */
  cellStates: ValidationState[];
}): React.JSX.Element {
  return (
    <div className="device-card device-card-memory" data-testid="memory-graph-card">
      {device.note && <p className="device-memory-note">{device.note}</p>}
      <div className="device-memory-cells">
        {device.cells.map((cell, index) => {
          // Falls back to "valid" only if the caller passed a shorter
          // array than `device.cells` -- never true for a real render path
          // (DeviceCard/ExecutionTraceCard always align 1:1), kept as an
          // honest fallback rather than a crash (same spirit as
          // CanvasBlocks.tsx's `?? step.label`).
          const state = cellStates[index] ?? "valid";
          const view = citationView(state);
          return (
            <div
              key={`${cell.key}-${String(index)}`}
              className={`device-memory-cell ${view.className}`}
            >
              <span className="device-memory-key">{cell.key}</span>
              <span className="device-memory-value">{cell.value}</span>
              {cell.ttl && <span className="device-memory-ttl">ttl {cell.ttl}</span>}
            </div>
          );
        })}
        {device.cells.length === 0 && <p className="device-memory-empty">(empty)</p>}
      </div>
    </div>
  );
}
