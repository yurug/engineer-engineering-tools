// Component: ReconnectBanner -- T2 (kb/properties/edge-cases.md#T2): "The
// UI detects server-gone, shows a banner with the exact `forebrief serve`
// command, and holds composed-but-unsent answers in a local buffer."
export function ReconnectBanner({
  repoRoot,
  pendingCount,
}: {
  repoRoot: string;
  pendingCount: number;
}): React.JSX.Element {
  const command = `forebrief serve --repo ${repoRoot}`;
  return (
    <div className="banner" role="alert" data-testid="reconnect-banner">
      <p>
        Can't reach the forebrief server. Run this in the repo, then re-open the new URL it prints:
      </p>
      <code>{command}</code>
      {pendingCount > 0 && (
        <p className="pending-note">
          {pendingCount} composed {pendingCount === 1 ? "answer is" : "answers are"} saved on this
          device and will replay once you're back.
        </p>
      )}
    </div>
  );
}
