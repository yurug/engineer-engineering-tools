// Component: DeviceStepper -- the control-bar half of the shared stepper
// (kb/spec/visual-devices.md#rendering: "the stepper (step / back / reset)
// is shared by trace and state-machine").
//
// Back and Reset are IDENTICAL affordances regardless of device kind (pop
// history / clear to initial -- lib/use-device-stepper.ts), so they live
// here, once. "Step forward" is NOT identical across kinds -- a trace has
// exactly one next frame (a single button); a state machine may have
// several outgoing transitions (the user picks one), so each renderer
// supplies its OWN forward control(s) as `children`, still calling the
// same `advance()` from the same hook. This is the honest shape of "shared
// stepper": one hook, one telemetry contract, one Back/Reset bar -- not a
// forced one-size-fits-all "Step" button that would make no sense for a
// branching device.
export function DeviceStepperControls({
  atStart,
  onBack,
  onReset,
  children,
}: {
  atStart: boolean;
  onBack: () => void;
  onReset: () => void;
  /** The kind-specific forward control(s) -- rendered between Back and Reset. */
  children?: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="device-stepper" data-testid="device-stepper">
      <button type="button" className="device-stepper-back" onClick={onBack} disabled={atStart}>
        ← Back
      </button>
      <div className="device-stepper-forward">{children}</div>
      <button type="button" className="device-stepper-reset" onClick={onReset} disabled={atStart}>
        Reset
      </button>
    </div>
  );
}
