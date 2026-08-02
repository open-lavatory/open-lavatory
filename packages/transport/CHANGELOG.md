# @openlv/transport

## 0.1.2

### Patch Changes

- 53f38fa: Lint the codebase and update vocabulary to disfavor shorthands
- Updated dependencies [53f38fa]
  - @openlv/core@0.1.2

## 0.1.1

### Patch Changes

- 28f2745: Update github repository
- Updated dependencies [28f2745]
  - @openlv/core@0.1.1

## 0.1.0

### Minor Changes

- 84c1637: Replace the handshake `ack` packet with `capabilities` — transport negotiation and peer identification in the same step (breaking wire change: peers on earlier versions cannot complete a handshake with this one).

  - Signaling: new `capabilities` packet carrying `transports` (preference-ordered) and optional `info` (`identity`, `name`, `icon`); `ack` is retired and rejected; inbound payloads are strictly size-bounded; the unused `dAppInfo` field on `pubkey` is removed
  - Transport: factories now expose their wire id (`TransportLayerFn` is `{ transportId, create }`; WebRTC is `wrtc`); negotiation messages use a generic transport-owned `{ type, payload }` envelope
  - Session: transports are negotiated — the first host preference both peers support wins, no common transport fails the session; new `info` option on `createSession`/`connectSession`, and the remote peer's info is exposed as `peerInfo` on the session state; empty transport lists and info a receiver would reject now throw at creation
  - Provider/connector: `config.info` identifies the dApp to wallets; the modal shows the wallet's name and icon once connected

- 15af508: Robustness and security hardening pass (wire protocol unchanged):

  - Debug logging is now opt-in (`OPENLV_DEBUG`); key material, handshake traffic, and RPC payloads no longer reach the console by default
  - Signaling frames from the public relay topic are shape-validated and errors are contained; malformed or undecryptable frames are dropped instead of raising unhandled rejections
  - Handshake steps are re-sent until acknowledged and time out after 30s, so a lost relay message no longer wedges the session permanently
  - The peer public key can no longer be replaced once recorded during a handshake
  - WebRTC: remote ICE candidates arriving before the offer/answer are buffered; connection failure and data-channel close now surface as transport errors (session becomes `disconnected`); dApp-side ICE server defaults are no longer silently emptied; discontinued openrelay TURN default removed
  - Provider: `createSession()` without parameters now derives defaults from stored settings; user-configured WebRTC transport settings are actually applied
  - Session: a throwing request handler now sends a JSON-RPC error response instead of leaving the peer waiting; `waitForLink()` no longer races state transitions; listeners are removed on `close()`
  - Core: strict hex/key-length validation, removal of the encrypt-to-self fallback, slimmed error classes, and removal of duplicated/unused exports (`SignalMessage` types from core, `combine`)

### Patch Changes

- Updated dependencies [15af508]
  - @openlv/core@0.1.0

## 0.0.3

### Patch Changes

- 72221ed: Migrate wagmi v2 to wagmi v3
- d823c31: Update transport type names & session transport initialization api
- Updated dependencies [72221ed]
  - @openlv/core@0.0.2

## 0.0.2

### Patch Changes

- 7d1e36b: Restructure transport base.ts and layer.ts to index.ts

## 0.0.1

### Patch Changes

- f76e2bc: Introduce webrtc transport, rework session & provider
- f76e2bc: Linting
- f76e2bc: Initial package publish
- f76e2bc: Added transport & signaling configs to the connector
- f76e2bc: Cleanup package.json
- f76e2bc: Update release
- Updated dependencies [f76e2bc]
- Updated dependencies [f76e2bc]
- Updated dependencies [f76e2bc]
- Updated dependencies [f76e2bc]
- Updated dependencies [f76e2bc]
- Updated dependencies [f76e2bc]
- Updated dependencies [f76e2bc]
- Updated dependencies [f76e2bc]
- Updated dependencies [f76e2bc]
- Updated dependencies [f76e2bc]
- Updated dependencies [f76e2bc]
  - @openlv/core@0.0.1

## 0.0.1-beta.9

### Patch Changes

- Updated dependencies [f76e2bc]
  - @openlv/core@0.0.1-beta.10

## 0.0.1-beta.8

### Patch Changes

- 8e4dddd: Linting
- Updated dependencies [8e4dddd]
  - @openlv/core@0.0.1-beta.9

## 0.0.1-beta.7

### Patch Changes

- 4f1eff0: Added transport & signaling configs to the connector

## 0.0.1-beta.6

### Patch Changes

- Updated dependencies [31e0469]
  - @openlv/core@0.0.1-beta.8

## 0.0.1-beta.5

### Patch Changes

- 4078665: Introduce webrtc transport, rework session & provider
- Updated dependencies [4078665]
  - @openlv/core@0.0.1-beta.7

## 0.0.1-beta.4

### Patch Changes

- 816831e: Cleanup package.json

## 0.0.1-beta.3

### Patch Changes

- ebbd7d9: Update release

## 0.0.1-beta.2

### Patch Changes

- 2cbfdd1: Initial package publish
