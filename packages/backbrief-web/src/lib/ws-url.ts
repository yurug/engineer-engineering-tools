// Module: lib/ws-url -- pure construction of the WS connect/reconnect URL.
//
// Split out from the connection hook so it's unit-testable without a DOM
// or a real WebSocket (kb/conventions/testing-strategy.md's unit level).
// api-contracts.md#websocket-browser-only: `GET /ws?token=&since=<seq>`.
export function buildWsUrl(httpOrigin: string, humanToken: string, sinceSeq: number): string {
  const wsOrigin = httpOrigin.replace(/^http/, "ws");
  return `${wsOrigin}/ws?token=${encodeURIComponent(humanToken)}&since=${String(sinceSeq)}`;
}
