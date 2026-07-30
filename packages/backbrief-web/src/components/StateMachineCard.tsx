// Component: StateMachineCard -- renders a StateMachine ("what modes
// exist -- what flips them?", kb/spec/visual-devices.md). The human fires
// transitions (never a timer -- P14); the current state is highlighted.
//
// Uses the shared lib/use-device-stepper.ts hook with `T = string` (a
// state id) -- unlike ExecutionTraceCard's single "Step" button, a state
// machine is BRANCHING (a state may have zero, one, or several outgoing
// transitions), so "step forward" here means "the user picked one of
// possibly several `advance(transition.to)` calls" -- rendered as one
// button per transition, enabled only for the ones leaving the CURRENT
// state. Every transition still renders (P1: never hide an element,
// flagged or not) -- the ones not currently firable are simply disabled,
// not removed.
import { useMemo } from "react";
import type { StateMachine } from "@backbrief/shared/browser";
import { alignStateMachineValidation } from "../lib/device-validation";
import { citationView } from "../lib/citation-view";
import { useDeviceStepper } from "../lib/use-device-stepper";
import { postMoveResponse } from "../lib/map-api";
import { DeviceStepperControls } from "./DeviceStepper";
import type { ApiConfig } from "../lib/api";
import type { EnvelopeFrame } from "../lib/use-backbrief-socket";

export function StateMachineCard({
  device,
  frame,
  api,
}: {
  device: StateMachine;
  frame: EnvelopeFrame;
  api: ApiConfig;
}): React.JSX.Element {
  const aligned = useMemo(
    () => alignStateMachineValidation(device, frame.envelope.refs.length, frame.validation),
    [device, frame.envelope.refs, frame.validation],
  );
  const stepper = useDeviceStepper<string>({
    initial: device.initial,
    onStep: () => void postMoveResponse(api, frame.envelope.id, "step"),
    onStall: () => void postMoveResponse(api, frame.envelope.id, "stall"),
  });
  const currentStateId = stepper.current;

  return (
    <div className="device-card device-card-state-machine" data-testid="state-machine-card">
      <div className="device-state-machine-states">
        {device.states.map((state) => {
          const view = citationView(aligned.stateStates.get(state.id) ?? "valid");
          const isCurrent = state.id === currentStateId;
          return (
            <span
              key={state.id}
              data-testid={`state-${state.id}`}
              className={`device-state ${view.className}${isCurrent ? " device-state-current" : ""}`}
            >
              {state.label}
            </span>
          );
        })}
      </div>
      <div className="device-state-machine-transitions">
        {device.transitions.map((transition, index) => {
          const view = citationView(aligned.transitionStates[index] ?? "valid");
          const isFirable = transition.from === currentStateId;
          return (
            <button
              // Transitions have no id of their own (visual-devices.md) --
              // index is safe: this list is never reordered or filtered in place.
              key={index}
              type="button"
              className={`device-transition ${view.className}`}
              disabled={!isFirable}
              onClick={() => stepper.advance(transition.to)}
            >
              {transition.event} → {transition.to}
            </button>
          );
        })}
      </div>
      <DeviceStepperControls
        atStart={stepper.atStart}
        onBack={stepper.back}
        onReset={stepper.reset}
      />
    </div>
  );
}
