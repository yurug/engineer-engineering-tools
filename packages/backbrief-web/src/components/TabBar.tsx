// Component: TabBar -- the tab shell's topbar: title, the Session/Map/Code
// tabs (pending-item badge on Map only, ADR-005 decision 3), the presence
// chip, and (R7-3) a top-right annotations-inbox control with a count badge.
//
// Visual reference: docs/design/rethink-mockup-2026-07-18.html's
// `.topbar`/`.tabs`/`.tab`/`.presence` -- `role="tablist"`/`role="tab"`/
// `aria-selected` match its markup shape exactly. The inbox control is
// placed AFTER PresenceChip (which carries `margin-left: auto`, pushing
// itself -- and everything after it -- to the topbar's far right) rather
// than reusing its own auto-margin, so "a top-right control" (kb/plan.md
// R7-3's own wording) falls out of normal flex flow instead of a second
// positioning rule.
import { PresenceChip } from "./PresenceChip";
import type { TabId } from "../lib/tabs";

const TAB_LABEL: Record<TabId, string> = { session: "Session", map: "Map", code: "Code" };
const TAB_ORDER: TabId[] = ["session", "map", "code"];

export function TabBar({
  activeTab,
  onSelect,
  mapBadgeCount,
  agentSeen,
  paused = false,
  inboxCount,
  onToggleInbox,
}: {
  activeTab: TabId;
  onSelect: (tab: TabId) => void;
  /** ADR-005 decision 3 / pedagogy-engine.md Rule 0: pending items are a badge, never a Session banner -- lib/pending-badges.ts computes this. */
  mapBadgeCount: number;
  agentSeen: string | null;
  /** kb/plan.md step 4 -- threaded straight through to PresenceChip. */
  paused?: boolean;
  /** R7-3 (ADR-007's "annotations get their own returnable inbox, never hijacking the current brief"): the count of open (non-archived) annotations. Both this and `onToggleInbox` are optional -- the button only renders when a caller actually wires the inbox (App.tsx), so every pre-existing TabBar test/caller is unaffected. */
  inboxCount?: number;
  onToggleInbox?: () => void;
}): React.JSX.Element {
  return (
    <div className="topbar">
      <div className="topbar-title">backbrief</div>
      <div className="tabs" role="tablist">
        {TAB_ORDER.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            className="tab"
            aria-selected={tab === activeTab}
            onClick={() => onSelect(tab)}
          >
            {TAB_LABEL[tab]}
            {tab === "map" && mapBadgeCount > 0 && (
              <span className="tab-badge">{mapBadgeCount}</span>
            )}
          </button>
        ))}
      </div>
      <PresenceChip agentSeen={agentSeen} paused={paused} />
      {onToggleInbox && (
        <button
          type="button"
          className="inbox-button"
          onClick={onToggleInbox}
          aria-label="Annotations inbox"
        >
          Annotations
          {(inboxCount ?? 0) > 0 && <span className="tab-badge">{inboxCount}</span>}
        </button>
      )}
    </div>
  );
}
