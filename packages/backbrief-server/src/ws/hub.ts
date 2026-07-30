// Module: ws/hub -- re-exports @brief/core's WebSocket hub (ADR-001,
// "ws hub"). `RepoAccess`/`KbAccess`/`Presence` (this package's fuller
// types) satisfy core's narrower `WsHubDeps` shape structurally, so the one
// existing call site (`attachWsHub(httpServer, {...})` in server.ts) needs
// no change.
export { attachWsHub, type WsHub, type WsHubDeps } from "@brief/core";
