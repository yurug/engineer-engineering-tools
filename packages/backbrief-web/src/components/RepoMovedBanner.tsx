// Component: RepoMovedBanner -- the "repo moved" degraded-state banner.
//
// error-taxonomy.md: "Repo moved (banner): head_changed; visible citations
// revalidate (P8c)." Dismissible per envelope pair (`from`/`to`) -- once
// the human has seen a given head_changed, re-showing the SAME banner on
// every re-render would be noise; a LATER head_changed (a different
// `to`) always re-shows it, since that is genuinely new information.
import { useState } from "react";
import type { HeadChangedInfo } from "../lib/repo-moved";

const SHORT_REV_LENGTH = 7;

function shortRev(rev: string): string {
  return rev === "worktree" || rev === "unborn" ? rev : rev.slice(0, SHORT_REV_LENGTH);
}

export function RepoMovedBanner({
  headChanged,
}: {
  headChanged: HeadChangedInfo;
}): React.JSX.Element | null {
  const [dismissedTo, setDismissedTo] = useState<string | null>(null);
  if (dismissedTo === headChanged.to) return null;

  return (
    <div className="repo-moved-banner" role="status">
      <span>
        repo moved: {shortRev(headChanged.from)} → {shortRev(headChanged.to)} (
        {headChanged.changedPaths.length} file{headChanged.changedPaths.length === 1 ? "" : "s"}{" "}
        changed) -- visible citations are revalidating
      </span>
      <button type="button" onClick={() => setDismissedTo(headChanged.to)}>
        dismiss
      </button>
    </div>
  );
}
