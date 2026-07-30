// Component: ExecutionTraceCard -- renders an ExecutionTrace ("what
// happens, step by step?", kb/spec/visual-devices.md), stepped by the
// human ONE frame at a time (P14: never autoplay).
//
// Uses the shared lib/use-device-stepper.ts hook with `T = number` (a
// frame index) -- ExecutionTrace is linear, so "step forward" always means
// "the next frame", unlike StateMachineCard's branching case (that file's
// header explains the shared-hook/per-kind-forward-control split).
import { useMemo } from "react";
import type { ExecutionTrace } from "@backbrief/shared/browser";
import { alignExecutionTraceValidation } from "../lib/device-validation";
import { citationView } from "../lib/citation-view";
import { useDeviceStepper } from "../lib/use-device-stepper";
import { postMoveResponse } from "../lib/map-api";
import { DeviceStepperControls } from "./DeviceStepper";
import { MemoryGraphCard } from "./MemoryGraphCard";
import type { ApiConfig } from "../lib/api";
import type { EnvelopeFrame } from "../lib/use-backbrief-socket";

export function ExecutionTraceCard({
  device,
  frame,
  api,
}: {
  device: ExecutionTrace;
  frame: EnvelopeFrame;
  api: ApiConfig;
}): React.JSX.Element {
  const aligned = useMemo(
    () => alignExecutionTraceValidation(device, frame.envelope.refs.length, frame.validation),
    [device, frame.envelope.refs, frame.validation],
  );
  const stepper = useDeviceStepper<number>({
    initial: 0,
    onStep: () => void postMoveResponse(api, frame.envelope.id, "step"),
    onStall: () => void postMoveResponse(api, frame.envelope.id, "stall"),
  });
  const maxIndex = device.frames.length - 1;
  const frameIndex = stepper.current;
  const frameSpec = device.frames[frameIndex] ?? device.frames[0];
  if (!frameSpec) {
    // Unreachable in practice: ExecutionTraceSchema requires >=1 frame
    // (devices.ts) -- this guard exists only to satisfy
    // noUncheckedIndexedAccess (code-style.md), never expected to render.
    return <p className="device-trace-empty">(no trace frames)</p>;
  }
  const view = citationView(aligned.frameStates[frameIndex] ?? "valid");
  const memoryCellStates = aligned.frameMemoryCellStates[frameIndex];

  return (
    <div className="device-card device-card-trace" data-testid="execution-trace-card">
      <p className="device-trace-input">{device.input}</p>
      <div className={`device-trace-frame ${view.className}`} data-testid="trace-frame">
        <span className="device-trace-position">
          frame {frameIndex + 1} / {maxIndex + 1}
        </span>
        <p className="device-trace-say">{frameSpec.say}</p>
        {frameSpec.memory && (
          <MemoryGraphCard device={frameSpec.memory} cellStates={memoryCellStates ?? []} />
        )}
      </div>
      <DeviceStepperControls
        atStart={stepper.atStart}
        onBack={stepper.back}
        onReset={stepper.reset}
      >
        <button
          type="button"
          className="device-stepper-step"
          disabled={frameIndex >= maxIndex}
          onClick={() => stepper.advance(Math.min(frameIndex + 1, maxIndex))}
        >
          Step →
        </button>
      </DeviceStepperControls>
    </div>
  );
}
