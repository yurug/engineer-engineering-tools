// Component: OptionCard -- one selectable option: key/label/default tag,
// its consequences (ConsequenceRow, ADR-002 chrome), and its reversibility
// badge (P2). Mouse AND keyboard both select (NF3: "Mouse works too but
// every action is keyboard-reachable") -- the click handler here and the
// `1`-`4` keyboard binding (App.tsx) both call the SAME `onSelect`.
import type { StoredOption } from "../lib/types";
import { ConsequenceRow } from "./ConsequenceRow";
import { ReversibilityBadge } from "./ReversibilityBadge";

export function OptionCard({
  option,
  isDefault,
  isSelected,
  disabled,
  onSelect,
}: {
  option: StoredOption;
  isDefault: boolean;
  isSelected: boolean;
  /** True once the card is committed -- read-only, no click/keyboard select fires. */
  disabled: boolean;
  onSelect: (key: StoredOption["key"]) => void;
}): React.JSX.Element {
  return (
    <div
      className={`opt${isSelected ? " selected" : ""}`}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-pressed={isSelected}
      aria-disabled={disabled}
      data-option-key={option.key}
      onClick={() => !disabled && onSelect(option.key)}
      onKeyDown={(e) => {
        if (!disabled && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onSelect(option.key);
        }
      }}
    >
      <div className="head">
        <span className="key">{option.key}</span>
        <span className="label">{option.label}</span>
        {isDefault && <span className="default-tag">default</span>}
      </div>
      <div className="cons">
        {option.consequences.map((c, i) => (
          <ConsequenceRow key={i} consequence={c} />
        ))}
      </div>
      <ReversibilityBadge reversibility={option.reversibility} />
    </div>
  );
}
