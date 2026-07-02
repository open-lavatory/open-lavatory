---
"@openlv/core": minor
"@openlv/signaling": minor
"@openlv/transport": minor
"@openlv/session": patch
"@openlv/provider": patch
"@openlv/connector": patch
---

Robustness and security hardening pass (wire protocol unchanged):

- Debug logging is now opt-in (`OPENLV_DEBUG`); key material, handshake traffic, and RPC payloads no longer reach the console by default
- Signaling frames from the public relay topic are shape-validated and errors are contained; malformed or undecryptable frames are dropped instead of raising unhandled rejections
- Handshake steps are re-sent until acknowledged and time out after 30s, so a lost relay message no longer wedges the session permanently
- The peer public key can no longer be replaced once recorded during a handshake
- WebRTC: remote ICE candidates arriving before the offer/answer are buffered; connection failure and data-channel close now surface as transport errors (session becomes `disconnected`); dApp-side ICE server defaults are no longer silently emptied; discontinued openrelay TURN default removed
- Provider: `createSession()` without parameters now derives defaults from stored settings; user-configured WebRTC transport settings are actually applied
- Session: a throwing request handler now sends a JSON-RPC error response instead of leaving the peer waiting; `waitForLink()` no longer races state transitions; listeners are removed on `close()`
- Core: strict hex/key-length validation, removal of the encrypt-to-self fallback, slimmed error classes, and removal of duplicated/unused exports (`SignalMessage` types from core, `combine`)
