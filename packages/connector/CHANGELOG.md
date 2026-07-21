# @openlv/connector

## 0.1.0

### Minor Changes

- 84c1637: Replace the handshake `ack` packet with `capabilities` — transport negotiation and peer identification in the same step (breaking wire change: peers on earlier versions cannot complete a handshake with this one).

  - Signaling: new `capabilities` packet carrying `transports` (preference-ordered) and optional `info` (`identity`, `name`, `icon`); `ack` is retired and rejected; inbound payloads are strictly size-bounded; the unused `dAppInfo` field on `pubkey` is removed
  - Transport: factories now expose their wire id (`TransportLayerFn` is `{ transportId, create }`; WebRTC is `wrtc`); negotiation messages use a generic transport-owned `{ type, payload }` envelope
  - Session: transports are negotiated — the first host preference both peers support wins, no common transport fails the session; new `info` option on `createSession`/`connectSession`, and the remote peer's info is exposed as `peerInfo` on the session state; empty transport lists and info a receiver would reject now throw at creation
  - Provider/connector: `config.info` identifies the dApp to wallets; the modal shows the wallet's name and icon once connected

### Patch Changes

- 15af508: Robustness and security hardening pass (wire protocol unchanged):

  - Debug logging is now opt-in (`OPENLV_DEBUG`); key material, handshake traffic, and RPC payloads no longer reach the console by default
  - Signaling frames from the public relay topic are shape-validated and errors are contained; malformed or undecryptable frames are dropped instead of raising unhandled rejections
  - Handshake steps are re-sent until acknowledged and time out after 30s, so a lost relay message no longer wedges the session permanently
  - The peer public key can no longer be replaced once recorded during a handshake
  - WebRTC: remote ICE candidates arriving before the offer/answer are buffered; connection failure and data-channel close now surface as transport errors (session becomes `disconnected`); dApp-side ICE server defaults are no longer silently emptied; discontinued openrelay TURN default removed
  - Provider: `createSession()` without parameters now derives defaults from stored settings; user-configured WebRTC transport settings are actually applied
  - Session: a throwing request handler now sends a JSON-RPC error response instead of leaving the peer waiting; `waitForLink()` no longer races state transitions; listeners are removed on `close()`
  - Core: strict hex/key-length validation, removal of the encrypt-to-self fallback, slimmed error classes, and removal of duplicated/unused exports (`SignalMessage` types from core, `combine`)

- Updated dependencies [84c1637]
- Updated dependencies [15af508]
  - @openlv/provider@0.1.0
  - @openlv/modal@0.1.0
  - @openlv/core@0.1.0

## 0.0.3

### Patch Changes

- 72221ed: Migrate wagmi v2 to wagmi v3
- Updated dependencies [72221ed]
- Updated dependencies [d823c31]
  - @openlv/provider@0.0.3
  - @openlv/core@0.0.2
  - @openlv/modal@0.0.3

## 0.0.2

### Patch Changes

- Updated dependencies [923519e]
  - @openlv/modal@0.0.2
  - @openlv/provider@0.0.2

## 0.0.1

### Patch Changes

- f76e2bc: Update connector icon
- f76e2bc: Migrate storage ownership from connector to provider
- f76e2bc: Introduce webrtc transport, rework session & provider
- f76e2bc: Reworked modal to solid-js
- f76e2bc: Cleanup legacy encryption & icon files & restructure of modal connection flow.
- f76e2bc: Removed @openlv/transport as dependency
- f76e2bc: Initial package publish
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
  - @openlv/modal@0.0.1
  - @openlv/provider@0.0.1

## 0.0.1-beta.13

### Patch Changes

- Updated dependencies [f76e2bc]
- Updated dependencies [f76e2bc]
  - @openlv/core@0.0.1-beta.10
  - @openlv/modal@0.0.1-beta.12
  - @openlv/provider@0.0.1-beta.12

## 0.0.1-beta.12

### Patch Changes

- cbc5942: Reworked modal to solid-js
- Updated dependencies [8e4dddd]
- Updated dependencies [cbc5942]
- Updated dependencies [cbc5942]
  - @openlv/core@0.0.1-beta.9
  - @openlv/modal@0.0.1-beta.11
  - @openlv/provider@0.0.1-beta.11

## 0.0.1-beta.11

### Patch Changes

- Updated dependencies [4f1eff0]
- Updated dependencies [56eca76]
  - @openlv/provider@0.0.1-beta.10
  - @openlv/modal@0.0.1-beta.10

## 0.0.1-beta.10

### Patch Changes

- Updated dependencies [7e8af28]
  - @openlv/provider@0.0.1-beta.9
  - @openlv/modal@0.0.1-beta.9

## 0.0.1-beta.9

### Patch Changes

- 299f247: Removed @openlv/transport as dependency

## 0.0.1-beta.8

### Patch Changes

- Updated dependencies [31e0469]
  - @openlv/modal@0.0.1-beta.8
  - @openlv/core@0.0.1-beta.8
  - @openlv/provider@0.0.1-beta.8
  - @openlv/transport@0.0.1-beta.6

## 0.0.1-beta.7

### Patch Changes

- Updated dependencies [69acf6e]
  - @openlv/modal@0.0.1-beta.7
  - @openlv/provider@0.0.1-beta.7

## 0.0.1-beta.6

### Patch Changes

- 4078665: Introduce webrtc transport, rework session & provider
- Updated dependencies [4078665]
  - @openlv/transport@0.0.1-beta.5
  - @openlv/provider@0.0.1-beta.6
  - @openlv/modal@0.0.1-beta.6
  - @openlv/core@0.0.1-beta.7

## 0.0.1-beta.5

### Patch Changes

- 455a951: Update connector icon
- 320502e: Migrate storage ownership from connector to provider
- 76005db: Cleanup legacy encryption & icon files & restructure of modal connection flow.
- Updated dependencies [320502e]
- Updated dependencies [a0ce2df]
- Updated dependencies [76005db]
- Updated dependencies [3c30a7b]
- Updated dependencies [4f3e7cb]
  - @openlv/provider@0.0.1-beta.5
  - @openlv/modal@0.0.1-beta.5
  - @openlv/core@0.0.1-beta.6

## 0.0.1-beta.4

### Patch Changes

- 816831e: Cleanup package.json
- Updated dependencies [6c27823]
- Updated dependencies [816831e]
- Updated dependencies [816831e]
  - @openlv/core@0.0.1-beta.5
  - @openlv/modal@0.0.1-beta.4
  - @openlv/provider@0.0.1-beta.4
  - @openlv/transport@0.0.1-beta.4

## 0.0.1-beta.3

### Patch Changes

- ebbd7d9: Update release
- Updated dependencies [ebbd7d9]
  - @openlv/core@0.0.1-beta.3
  - @openlv/modal@0.0.1-beta.3
  - @openlv/provider@0.0.1-beta.3
  - @openlv/transport@0.0.1-beta.3

## 0.0.1-beta.2

### Patch Changes

- 12008d4: Initial package publish
- Updated dependencies [2cbfdd1]
  - @openlv/core@0.0.1-beta.2
  - @openlv/modal@0.0.1-beta.2
  - @openlv/provider@0.0.1-beta.2
  - @openlv/transport@0.0.1-beta.2
