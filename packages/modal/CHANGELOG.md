# @openlv/modal

## 0.1.3

### Patch Changes

- 53f38fa: Lint the codebase and update vocabulary to disfavor shorthands
- Updated dependencies [53f38fa]
  - @openlv/signaling@0.1.3
  - @openlv/provider@0.1.3
  - @openlv/session@0.1.3
  - @openlv/core@0.1.2

## 0.1.2

### Patch Changes

- 28f2745: Update github repository
- Updated dependencies [28f2745]
  - @openlv/signaling@0.1.2
  - @openlv/provider@0.1.2
  - @openlv/session@0.1.2
  - @openlv/core@0.1.1

## 0.1.1

### Patch Changes

- Updated dependencies [4514d4f]
  - @openlv/signaling@0.1.1
  - @openlv/provider@0.1.1
  - @openlv/session@0.1.1

## 0.1.0

### Minor Changes

- 84c1637: Replace the handshake `ack` packet with `capabilities` — transport negotiation and peer identification in the same step (breaking wire change: peers on earlier versions cannot complete a handshake with this one).

  - Signaling: new `capabilities` packet carrying `transports` (preference-ordered) and optional `info` (`identity`, `name`, `icon`); `ack` is retired and rejected; inbound payloads are strictly size-bounded; the unused `dAppInfo` field on `pubkey` is removed
  - Transport: factories now expose their wire id (`TransportLayerFn` is `{ transportId, create }`; WebRTC is `wrtc`); negotiation messages use a generic transport-owned `{ type, payload }` envelope
  - Session: transports are negotiated — the first host preference both peers support wins, no common transport fails the session; new `info` option on `createSession`/`connectSession`, and the remote peer's info is exposed as `peerInfo` on the session state; empty transport lists and info a receiver would reject now throw at creation
  - Provider/connector: `config.info` identifies the dApp to wallets; the modal shows the wallet's name and icon once connected

### Patch Changes

- Updated dependencies [84c1637]
- Updated dependencies [15af508]
  - @openlv/signaling@0.1.0
  - @openlv/session@0.1.0
  - @openlv/provider@0.1.0
  - @openlv/core@0.1.0

## 0.0.3

### Patch Changes

- Updated dependencies [72221ed]
- Updated dependencies [d823c31]
  - @openlv/signaling@0.0.3
  - @openlv/provider@0.0.3
  - @openlv/session@0.0.3
  - @openlv/core@0.0.2

## 0.0.2

### Patch Changes

- 923519e: Migrate from 'qrcode-generator' to 'qr'
- Updated dependencies [b491ecd]
  - @openlv/signaling@0.0.2
  - @openlv/provider@0.0.2
  - @openlv/session@0.0.2

## 0.0.1

### Patch Changes

- f76e2bc: Move qrcode-generator to dependencies
- f76e2bc: Migrate storage ownership from connector to provider
- f76e2bc: Introduce webrtc transport, rework session & provider
- f76e2bc: Update styling & ui components
- f76e2bc: Reworked modal to solid-js
- f76e2bc: Initial package publish
- f76e2bc: Cleanup legacy encryption & icon files & restructure of modal connection flow.
- f76e2bc: Update imports
- f76e2bc: Update settings UI
- f76e2bc: Introduce i18n for en, nl, se, fr, es, ar, fe, he
- f76e2bc: Fix bug when resizing the window
- f76e2bc: Added transport & signaling configs to the connector
- f76e2bc: Introduce session linking stage
- f76e2bc: Added custom font support to themes
- f76e2bc: Update icons in modal
- f76e2bc: Cleanup package.json
- f76e2bc: Introduce user-configurable theme mode in the settings menu
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
  - @openlv/core@0.0.1
  - @openlv/provider@0.0.1
  - @openlv/signaling@0.0.1
  - @openlv/session@0.0.1

## 0.0.1-beta.12

### Patch Changes

- f76e2bc: Fix bug when resizing the window
- Updated dependencies [f76e2bc]
  - @openlv/core@0.0.1-beta.10
  - @openlv/provider@0.0.1-beta.12
  - @openlv/session@0.0.1-beta.12
  - @openlv/signaling@0.0.1-beta.9

## 0.0.1-beta.11

### Patch Changes

- cbc5942: Reworked modal to solid-js
- cbc5942: Added custom font support to themes
- Updated dependencies [8e4dddd]
- Updated dependencies [cbc5942]
  - @openlv/core@0.0.1-beta.9
  - @openlv/session@0.0.1-beta.11
  - @openlv/signaling@0.0.1-beta.8
  - @openlv/provider@0.0.1-beta.11

## 0.0.1-beta.10

### Patch Changes

- 4f1eff0: Added transport & signaling configs to the connector
- 56eca76: Introduce user-configurable theme mode in the settings menu
- Updated dependencies [4f1eff0]
- Updated dependencies [56eca76]
  - @openlv/provider@0.0.1-beta.10
  - @openlv/session@0.0.1-beta.10

## 0.0.1-beta.9

### Patch Changes

- 7e8af28: Introduce i18n for en, nl, se, fr, es, ar, fe, he
- Updated dependencies [7e8af28]
  - @openlv/provider@0.0.1-beta.9

## 0.0.1-beta.8

### Patch Changes

- 31e0469: Introduce session linking stage
- Updated dependencies [68feee0]
- Updated dependencies [31e0469]
  - @openlv/signaling@0.0.1-beta.7
  - @openlv/session@0.0.1-beta.9
  - @openlv/core@0.0.1-beta.8
  - @openlv/provider@0.0.1-beta.8

## 0.0.1-beta.7

### Patch Changes

- 69acf6e: Update imports
- Updated dependencies [592d1c2]
  - @openlv/session@0.0.1-beta.8
  - @openlv/provider@0.0.1-beta.7

## 0.0.1-beta.6

### Patch Changes

- 4078665: Introduce webrtc transport, rework session & provider
- Updated dependencies [4078665]
  - @openlv/signaling@0.0.1-beta.6
  - @openlv/provider@0.0.1-beta.6
  - @openlv/session@0.0.1-beta.7
  - @openlv/core@0.0.1-beta.7

## 0.0.1-beta.5

### Patch Changes

- 320502e: Migrate storage ownership from connector to provider
- a0ce2df: Update styling & ui components
- 76005db: Cleanup legacy encryption & icon files & restructure of modal connection flow.
- 3c30a7b: Update settings UI
- 4f3e7cb: Update icons in modal
- Updated dependencies [320502e]
- Updated dependencies [76005db]
  - @openlv/provider@0.0.1-beta.5
  - @openlv/core@0.0.1-beta.6
  - @openlv/session@0.0.1-beta.6

## 0.0.1-beta.4

### Patch Changes

- 816831e: Move qrcode-generator to dependencies
- 816831e: Cleanup package.json
- Updated dependencies [6c27823]
- Updated dependencies [816831e]
  - @openlv/core@0.0.1-beta.5
  - @openlv/provider@0.0.1-beta.4
  - @openlv/session@0.0.1-beta.5

## 0.0.1-beta.3

### Patch Changes

- ebbd7d9: Update release
- Updated dependencies [ebbd7d9]
  - @openlv/core@0.0.1-beta.3
  - @openlv/provider@0.0.1-beta.3
  - @openlv/session@0.0.1-beta.3

## 0.0.1-beta.2

### Patch Changes

- 2cbfdd1: Initial package publish
- Updated dependencies [2cbfdd1]
  - @openlv/core@0.0.1-beta.2
  - @openlv/provider@0.0.1-beta.2
  - @openlv/session@0.0.1-beta.2
