// Component: NoKbModeNotice -- C1 (Phase 5 audit): the explicit UI notice
// error-taxonomy.md's degraded-state rule requires ("No-KB mode (notice):
// navigation/annotation work; grounded features off") but which no
// component previously rendered -- the flag was computed server-side
// (kb-access.ts#detectNoKbMode) and gated `ask_question` (T2), but nothing
// ever told the human WHY that structural rejection would happen, or that
// KB browsing/annotation is unavailable. Same non-dismissible-banner shape
// as RepoMovedBanner.tsx's `role="status"` pattern, but this condition
// never clears mid-session (noKbMode is boot-time config, lib/use-no-kb-
// mode.ts's module header), so there is no dismiss button to build.
export function NoKbModeNotice({ noKbMode }: { noKbMode: boolean }): React.JSX.Element | null {
  if (!noKbMode) return null;
  return (
    <div className="no-kb-mode-notice" role="status" data-testid="no-kb-mode-notice">
      No knowledge base is configured for this repo -- code-only session. KB browsing and challenge
      questions (ask_question) are unavailable; navigation, annotation, and tours over code
      citations still work.
    </div>
  );
}
