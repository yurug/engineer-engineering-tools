// Component: AwaitingAgentStatus -- the small, honest "something is
// happening" status shown next to a just-used control while its agent
// reply is outstanding (lib/awaiting-agent.ts's state machine).
//
// @invariant P5: renders NOTHING (null) when idle -- never a placeholder
// dot implying activity that isn't real. Colour: none -- this is ink/
// neutral text exactly like PresenceChip, because "awaiting a reply" is
// not a proof-status claim (visual-design.md #1 reserves colour for
// proven/trusted/contested only).
// The animated affordance (a pulsing dot, styles.css's
// `.awaiting-agent-working .awaiting-agent-dot`) is CSS-only and scoped to
// `state === "working"`: a "queued" (away) agent gets a STATIC dot,
// because animating it would itself be a fake-activity claim -- nothing is
// imminently happening. `prefers-reduced-motion: reduce` turns the
// "working" pulse static too (styles.css), per visual-design.md's quality
// floor.
export function AwaitingAgentStatus({
  state,
  label,
}: {
  state: "idle" | "working" | "queued";
  label: string | null;
}): React.JSX.Element | null {
  if (state === "idle" || label === null) return null;
  return (
    <p
      className={`awaiting-agent awaiting-agent-${state}`}
      role="status"
      aria-live="polite"
      aria-busy={state === "working"}
    >
      <span className="awaiting-agent-dot" aria-hidden="true" />
      {label}
    </p>
  );
}
