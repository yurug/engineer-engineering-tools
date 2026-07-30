// Component: AwaitingReconciliationList -- open provisional decisions (kb/
// spec/algorithms.md's provisional lifecycle: posted -> provisional-applied
// -> {confirmed | overridden}).
//
// Reconciliation UI (user feedback seq 21 -- scope change, explicitly user-
// demanded: "using the chat is not consistent with also having a web UI"):
// every entry gets a Confirm control (finalizes the applied default) and an
// Override control (pick a different option from the card's own options,
// plus a rationale -- the SAME one-nudge-then-bare treatment as T3, kb/
// properties/edge-cases.md#T3). Both post a `reconciliation` record through
// the same lib/api.ts `postRecord` every other commit in this app uses.
// Entries disappear from the list on their own once the resulting record
// round-trips back through `session.records`: App.tsx's `openProvisionals`
// already filters out any card with a reconciliation record of ANY mode
// (data-model.md/algorithms.md's spec completion), so this component keeps
// no separate "resolved" list of its own -- only a per-card `pending` flag
// to disable a control while its own request is in flight.
//
// Keyboard: normal tab/click reachability only -- NO new global single-key
// binding. NF3's table (kb/properties/non-functional.md) stays exactly as
// it is; this list sits ABOVE the round view, and a global binding here
// would collide with the card-level bindings the round view already owns.
//
// card-copy.md's derived-surfaces rule (user feedback, 2026-07-25: "That's
// VERY cryptic!"): every entry shows the card's PROMPT and the applied
// option's LABEL; the seq is a trailing locator for `forebrief act`
// reconciliation, never the label. Prompts (and, for Override, the other
// option labels) come from cardIndex because a provisional's card usually
// belongs to a CLOSED round.
import { useState } from "react";
import { postRecord, type ApiConfig } from "../lib/api";
import type { OpenProvisional } from "../lib/records";
import type { CardSummary, OptionKey, ReconciliationMode } from "../lib/types";

interface OverrideDraft {
  open: boolean;
  key: string | null;
  rationale: string;
  /** T3-style: already nudged once for this override -- the next commit proceeds bare. */
  nudged: boolean;
}

const BLANK_OVERRIDE: OverrideDraft = { open: false, key: null, rationale: "", nudged: false };
const OVERRIDE_NUDGE_MESSAGE =
  "Override without rationale — say why it matters. Committing again proceeds bare.";

export function AwaitingReconciliationList({
  provisionals,
  cardIndex,
  api,
}: {
  provisionals: readonly OpenProvisional[];
  cardIndex: Record<string, CardSummary>;
  api: ApiConfig;
}): React.JSX.Element | null {
  const [overrides, setOverrides] = useState<Record<string, OverrideDraft>>({});
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [nudgedCard, setNudgedCard] = useState<string | null>(null);

  if (provisionals.length === 0) return null;

  const draftFor = (cardId: string): OverrideDraft => overrides[cardId] ?? BLANK_OVERRIDE;

  async function submit(
    cardId: string,
    final: string,
    mode: ReconciliationMode,
    rationale?: string,
  ): Promise<void> {
    setPending((prev) => new Set(prev).add(cardId));
    try {
      await postRecord(api, {
        kind: "reconciliation",
        card: cardId,
        final: final as OptionKey,
        mode,
        source_channel: "ui",
        ...(rationale ? { rationale } : {}),
      });
    } finally {
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(cardId);
        return next;
      });
    }
  }

  function handleConfirm(p: OpenProvisional): void {
    void submit(p.card, p.chosen, "confirmed");
  }

  function openOverride(p: OpenProvisional, otherKey: string | undefined): void {
    const current = draftFor(p.card);
    setOverrides((prev) => ({
      ...prev,
      [p.card]: { ...current, open: true, key: current.key ?? otherKey ?? null },
    }));
  }

  function setOverrideKey(cardId: string, key: string): void {
    setOverrides((prev) => ({ ...prev, [cardId]: { ...draftFor(cardId), key } }));
  }

  function setOverrideRationale(cardId: string, rationale: string): void {
    setOverrides((prev) => ({ ...prev, [cardId]: { ...draftFor(cardId), rationale } }));
    if (nudgedCard === cardId) setNudgedCard(null);
  }

  function handleOverrideCommit(p: OpenProvisional): void {
    const draft = draftFor(p.card);
    if (!draft.key) return;
    if (draft.rationale.trim().length === 0 && !draft.nudged) {
      setOverrides((prev) => ({ ...prev, [p.card]: { ...draft, nudged: true } }));
      setNudgedCard(p.card);
      return;
    }
    setNudgedCard((current) => (current === p.card ? null : current));
    void submit(p.card, draft.key, "overridden", draft.rationale.trim() || undefined);
  }

  return (
    <div className="awaiting-reconciliation" data-testid="awaiting-reconciliation">
      <h2>Awaiting reconciliation</h2>
      <p className="note">
        The agent already applied a default for each of these and kept working. Nothing is final
        until you confirm or override it below.
      </p>
      <ul>
        {provisionals.map((p) => {
          const summary = cardIndex[p.card];
          const appliedLabel = summary?.options.find((o) => o.key === p.chosen)?.label;
          const draft = draftFor(p.card);
          const isPending = pending.has(p.card);
          return (
            <li key={p.card}>
              <div className="reconcile-row">
                <span className="prompt">{summary ? summary.prompt : `card ${p.card}`}</span>
                <span className="applied">
                  {" — applied: "}
                  {appliedLabel ?? `option ${p.chosen}`}
                </span>
                {p.rationale && <span className="rationale"> · {p.rationale}</span>}
                <span className="locator"> (seq {p.seq})</span>
              </div>
              <div className="reconcile-actions">
                <button type="button" disabled={isPending} onClick={() => handleConfirm(p)}>
                  Confirm
                </button>
                {summary && (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() =>
                      openOverride(p, summary.options.find((o) => o.key !== p.chosen)?.key)
                    }
                  >
                    Override
                  </button>
                )}
              </div>
              {draft.open && summary && (
                <div className="override-panel">
                  <label>
                    New option
                    <select
                      aria-label={`Override option for: ${summary.prompt}`}
                      value={draft.key ?? ""}
                      onChange={(e) => setOverrideKey(p.card, e.target.value)}
                    >
                      {summary.options.map((o) => (
                        <option key={o.key} value={o.key}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Rationale
                    <textarea
                      aria-label={`Override rationale for: ${summary.prompt}`}
                      value={draft.rationale}
                      onChange={(e) => setOverrideRationale(p.card, e.target.value)}
                    />
                  </label>
                  {nudgedCard === p.card && (
                    <p className="nudge" role="alert">
                      {OVERRIDE_NUDGE_MESSAGE}
                    </p>
                  )}
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleOverrideCommit(p)}
                  >
                    Commit override
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
