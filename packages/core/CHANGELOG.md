# @openlv/core

## 0.2.0

### Minor Changes

- 891501c: Migrated from Eventemitter-based to observables. Along the way deprecating `state_change` and `getState()` with `get()`, `subscribe()` and `until()`. Also renaming previously uppercase `SESSION_STATE` to `SessionStatus`, same for singaling and transport.

## 0.1.2

### Patch Changes

- 53f38fa: Lint the codebase and update vocabulary to disfavor shorthands

## 0.1.1

### Patch Changes

- 28f2745: Update github repository

## 0.1.0

### Minor Changes

- 15af508: Robustness and security hardening pass (wire protocol unchanged):

  - Debug logging is now opt-in (`OPENLV_DEBUG`); key material, handshake traffic, and RPC payloads no longer reach the console by default
  - Signaling frames from the public relay topic are shape-validated and errors are contained; malformed or undecryptable frames are dropped instead of raising unhandled rejections
  - Handshake steps are re-sent until acknowledged and time out after 30s, so a lost relay message no longer wedges the session permanently
  - The peer public key can no longer be replaced once recorded during a handshake
  - WebRTC: remote ICE candidates arriving before the offer/answer are buffered; connection failure and data-channel close now surface as transport errors (session becomes `disconnected`); dApp-side ICE server defaults are no longer silently emptied; discontinued openrelay TURN default removed
  - Provider: `createSession()` without parameters now derives defaults from stored settings; user-configured WebRTC transport settings are actually applied
  - Session: a throwing request handler now sends a JSON-RPC error response instead of leaving the peer waiting; `waitForLink()` no longer races state transitions; listeners are removed on `close()`
  - Core: strict hex/key-length validation, removal of the encrypt-to-self fallback, slimmed error classes, and removal of duplicated/unused exports (`SignalMessage` types from core, `combine`)

## 0.0.2

### Patch Changes

- 72221ed: Migrate wagmi v2 to wagmi v3

## 0.0.1

### Patch Changes

- f76e2bc: Update CI
- f76e2bc: Migrate storage ownership from connector to provider
- f76e2bc: Introduce webrtc transport, rework session & provider
- f76e2bc: Replace tweetnacl peer encryption with a noble-based X25519 and XSalsa20-Poly1305 implementation.
- f76e2bc: Linting
- f76e2bc: Introduce openlv version number parsing "@1"
- f76e2bc: Initial package publish
- f76e2bc: Cleanup legacy encryption & icon files & restructure of modal connection flow.
- f76e2bc: Introduce session linking stage
- f76e2bc: Cleanup package.json
- f76e2bc: Update release

## 0.0.1-beta.10

### Patch Changes

- f76e2bc: Replace tweetnacl peer encryption with a noble-based X25519 and XSalsa20-Poly1305 implementation.

## 0.0.1-beta.9

### Patch Changes

- 8e4dddd: Linting

## 0.0.1-beta.8

### Patch Changes

- 31e0469: Introduce session linking stage

## 0.0.1-beta.7

### Patch Changes

- 4078665: Introduce webrtc transport, rework session & provider

## 0.0.1-beta.6

### Patch Changes

- 320502e: Migrate storage ownership from connector to provider
- 76005db: Cleanup legacy encryption & icon files & restructure of modal connection flow.

## 0.0.1-beta.5

### Patch Changes

- 6c27823: Update CI
- 816831e: Cleanup package.json

## 0.0.1-beta.4

### Patch Changes

- 0262c51: Introduce openlv version number parsing "@1"

## 0.0.1-beta.3

### Patch Changes

- ebbd7d9: Update release

## 0.0.1-beta.2

### Patch Changes

- 2cbfdd1: Initial package publish
