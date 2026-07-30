// Component: DeviceCard -- the single dispatcher a present_move's `device`
// mounts through, one branch per kind of the 5-kind catalog
// (kb/spec/visual-devices.md).
//
// Step 1 shipped `law`/`scenario` inline here, deliberately minimal ("web --
// minimal": text + a citation strip for the WHOLE move, see SessionMove.tsx).
// Step 2's three dynamic/composite kinds (trace, state-machine, memory) get
// their OWN renderer component apiece (visual-devices.md#rendering: "one
// renderer component per kind") -- ExecutionTraceCard/StateMachineCard/
// MemoryGraphCard -- because they need `frame`/`api` to align per-element
// citation states and (for the two dynamic ones) to post stepper telemetry;
// law/scenario need neither, so they stay as the original inline branches
// rather than being churned into components with unused props. This file
// stays the ONE place SessionMove.tsx mounts, regardless of kind.
import type { DeviceSpec } from "@backbrief/shared/browser";
import { alignMemoryGraphValidation } from "../lib/device-validation";
import { ExecutionTraceCard } from "./ExecutionTraceCard";
import { StateMachineCard } from "./StateMachineCard";
import { MemoryGraphCard } from "./MemoryGraphCard";
import type { ApiConfig } from "../lib/api";
import type { EnvelopeFrame } from "../lib/use-backbrief-socket";

export function DeviceCard({
  device,
  frame,
  api,
}: {
  device: DeviceSpec;
  /** Needed only by the step-2 kinds (citation alignment + moveId for stepper telemetry) -- see module header. */
  frame: EnvelopeFrame;
  api: ApiConfig;
}): React.JSX.Element {
  if (device.kind === "law") {
    return (
      <div className="device-card device-card-law">
        <pre className="device-law-statement">{device.statement}</pre>
        <p className="device-law-reading">{device.reading}</p>
      </div>
    );
  }
  if (device.kind === "scenario") {
    return (
      <div className="device-card device-card-scenario">
        {device.strips.map((strip, stripIndex) => (
          // Strips have no stable id of their own (visual-devices.md); index
          // is safe -- present_move payloads are never reordered in place.
          <div className="device-scenario-strip" key={stripIndex}>
            <h4>{strip.label}</h4>
            <div className="device-scenario-tokens">
              {strip.tokens.map((token, tokenIndex) => (
                <span
                  key={tokenIndex}
                  className={`device-token${token.state ? ` device-token-${token.state}` : ""}`}
                >
                  {token.text}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (device.kind === "trace")
    return <ExecutionTraceCard device={device} frame={frame} api={api} />;
  if (device.kind === "state-machine") {
    return <StateMachineCard device={device} frame={frame} api={api} />;
  }
  // device.kind === "memory": the only remaining member of the union --
  // TS narrows this exhaustively (verified by the "no default" pattern
  // pedagogy.ts's checkDeviceBudgets already uses for the same union).
  const cellStates = alignMemoryGraphValidation(
    device,
    frame.envelope.refs.length,
    frame.validation,
  );
  return <MemoryGraphCard device={device} cellStates={cellStates} />;
}
