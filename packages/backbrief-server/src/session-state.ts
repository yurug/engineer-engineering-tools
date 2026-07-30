// Module: session-state -- the one mutable handle to "the current session"
// shared across every route.
//
// data-model.md: "One active session per repo at a time" -- a serve
// instance owns exactly one Session for its whole process lifetime. This
// tiny class exists so route handlers (api/actions.ts, api/session.ts) can
// read/update that single Session without importing the store module
// directly, keeping "who persists the Session" (store/session-store.ts) and
// "who currently holds it in memory" (this class) separate concerns.
import type { Session } from "@backbrief/shared";

export class SessionState {
  constructor(private session: Session) {}

  get(): Session {
    return this.session;
  }

  set(next: Session): void {
    this.session = next;
  }
}
