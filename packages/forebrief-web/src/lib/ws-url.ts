// Module: lib/ws-url -- pure construction of the WS connect/reconnect URL.
//
// Split out from the connection hook so it's unit-testable without a DOM
// or a real WebSocket (kb/conventions/testing-strategy.md's unit level).
// kb/spec/cli-contract.md's HTTP surface: `WS /ws?token=` (human token
// only). `since` is core's own replay cursor (@brief/core's ws/hub.ts:
// "since = Number(url.searchParams.get('since') ?? '0')") -- passing the
// highest `seq` already seen means a dropped-and-reconnected socket never
// re-sends the whole log from zero (the initial `GET /api/state` bootstrap
// already delivered it once).
export function buildWsUrl(httpOrigin: string, humanToken: string, sinceSeq: number): string {
  const wsOrigin = httpOrigin.replace(/^http/, "ws");
  return `${wsOrigin}/ws?token=${encodeURIComponent(humanToken)}&since=${String(sinceSeq)}`;
}
