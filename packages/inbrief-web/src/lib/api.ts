// Module: lib/api -- talking to the server.
//
// The token comes from the page's own URL, because that URL is what `inbrief
// serve` printed and handed to the human. It is the HUMAN token: it is what
// makes a mastery claim in this browser legitimate, and it is the only reason
// the server will accept one (P3).
import type { SessionState, Mastery, SteerabilityStatement } from "./types";

/**
 * @returns the bearer token from `?token=`, or null
 * @invariant read once at module load rather than per request: a token that
 *   changed mid-session would mean the page is talking to a different server
 *   than it started with, and silently following that is worse than failing.
 */
export function tokenFromUrl(search: string): string | null {
  return new URLSearchParams(search).get("token");
}

export class Api {
  constructor(
    private readonly token: string,
    private readonly origin = "",
  ) {}

  async state(): Promise<SessionState> {
    return this.json<SessionState>("/api/state");
  }

  /**
   * Claims mastery. There is no actor field, on purpose: the server derives it
   * from this token, so a browser cannot claim to be anyone else.
   */
  async setMastery(node: string, mastery: Mastery): Promise<void> {
    await this.send("/api/mastery", { node, mastery });
  }

  /**
   * Records a question for later (ADR-030).
   *
   * @invariant returns the send's promise so the caller can report a FAILURE,
   *   and nothing more: there is no answer to wait for by design.
   */
  async ask(text: string, node: string | null): Promise<void> {
    await this.send("/api/questions", { text, node });
  }

  async close(): Promise<SteerabilityStatement> {
    return this.send<SteerabilityStatement>("/api/close", {});
  }

  private async json<T>(path: string): Promise<T> {
    const res = await fetch(`${this.origin}${path}`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!res.ok) throw new Error(`${path} answered ${String(res.status)}`);
    return (await res.json()) as T;
  }

  private async send<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.origin}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${path} answered ${String(res.status)}`);
    return (await res.json()) as T;
  }
}
