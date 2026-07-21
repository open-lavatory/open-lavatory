---
"@openlv/signaling": minor
"@openlv/transport": minor
"@openlv/session": minor
"@openlv/provider": minor
"@openlv/modal": minor
"@openlv/connector": minor
---

Replace the handshake `ack` packet with `capabilities` — transport negotiation and peer identification in the same step (breaking wire change: peers on earlier versions cannot complete a handshake with this one).

- Signaling: new `capabilities` packet carrying `transports` (preference-ordered) and optional `info` (`identity`, `name`, `icon`); `ack` is retired and rejected; inbound payloads are strictly size-bounded; the unused `dAppInfo` field on `pubkey` is removed
- Transport: factories now expose their wire id (`TransportLayerFn` is `{ transportId, create }`; WebRTC is `wrtc`); negotiation messages use a generic transport-owned `{ type, payload }` envelope
- Session: transports are negotiated — the first host preference both peers support wins, no common transport fails the session; new `info` option on `createSession`/`connectSession`, and the remote peer's info is exposed as `peerInfo` on the session state; empty transport lists and info a receiver would reject now throw at creation
- Provider/connector: `config.info` identifies the dApp to wallets; the modal shows the wallet's name and icon once connected
