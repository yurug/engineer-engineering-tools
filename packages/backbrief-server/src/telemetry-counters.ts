// Module: telemetry-counters -- the one mutable in-memory counter NF6's
// telemetry needs that the event log itself cannot reconstruct.
//
// telemetry.ts's `writeTelemetryLine` (session_end) folds the session's own
// envelopes for most fields (eventCounts, movesPresented, stallEvents,
// nodesDemonstrated). `budgetRejections` (kb/plan.md step 4) cannot be
// derived that way: an `E_OVER_BUDGET` rejection (P12) is thrown BEFORE the
// rejected `present_move` is ever appended (server/api/actions.ts), so it
// never reaches the log -- the only durable trace of a rejection would be
// the agent's own retry, which is indistinguishable from any other
// present_move. This tiny class is that missing durable-enough record: a
// live counter, incremented at the rejection site, read once at session_end
// -- mirrors session-state.ts's own shape exactly (one mutable value, one
// small class, DI'd into the route deps that need it).
export class TelemetryCounters {
  private budgetRejectionsCount = 0;

  /** @invariant NF6 called exactly once per E_OVER_BUDGET rejection -- server/api/actions.ts's present_move guard is the only call site. */
  recordBudgetRejection(): void {
    this.budgetRejectionsCount += 1;
  }

  /** @returns the count so far this process's lifetime -- one server process is always exactly one session (session-state.ts's own invariant), so this needs no per-session reset. */
  budgetRejections(): number {
    return this.budgetRejectionsCount;
  }
}
