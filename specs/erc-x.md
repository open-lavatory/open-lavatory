---
title: open-lavatory Wallet-Dapp Transport Layer
description: A wire protocol for establishing wallet-dapp EIP-1193-compatible transport.
author: TBD
discussions-to: TBD
status: Draft
type: Standards Track
category: ERC
created: 2026-04-29
requires: 1193
---

## Abstract

This specification defines `open-lavatory`, hereafter `openlv`, an Ethereum wallet-dapp wire protocol for session establishment and transport of EIP-1193 messages.
`openlv` standardizes a bootstrap URI, encrypted signaling frames, transport negotiation messages, a correlated session message envelope, and an optional session resumption model.
It builds upon the wallet pairing flow introduced by [EIP-1328](./eip-1328.md).

## Motivation

Ethereum wallet connectivity benefits from protocols that are portable, open, and easy for wallets and dapps to adopt without depending on a single service provider or control plane.
The ecosystem benefits when users and implementers can choose their own infrastructure, self-host when desired, and preserve compatibility across independent implementations.

`openlv` preserves the familiar wallet-pairing model while allowing wallets and dapps to exchange standard EIP-1193 messages over user-chosen signaling infrastructure and a direct peer transport.
It offers an open and interoperable approach to wallet connectivity while keeping the transport of Ethereum wallet messages straightforward.

## Specification

### Overview

`openlv` operates in five steps:

1. An advertising peer creates a session URI.
2. That URI is transferred out-of-band to a joining peer.
3. Both peers use shared signaling infrastructure to exchange encrypted bootstrap messages and negotiate transport.
4. The peers establish a direct transport.
5. EIP-1193 request and response messages flow over the established transport.

Peers are asymmetric only during bootstrap and signaling.
After transport establishment, both parties are simply peers and may send requests and responses bidirectionally.

### Roles

- **Advertising peer**: the peer that creates and shares the session URI. In common deployments, the dapp.
- **Joining peer**: the peer that receives the session URI and joins the session. In common deployments, the wallet.

These roles apply only to bootstrap and signaling behavior.

### Protocol Phases

Version 1 has two communication layers.

- **Signaling layer**: used to bootstrap the session, exchange peer key material, and carry transport negotiation payloads.
- **Transport layer**: used after negotiation for ordinary application traffic.

The signaling layer exists only to establish secure peer communication.
After the transport layer is established, EIP-1193 messages are carried using the session envelope described below.

### Session URI

The version 1 session URI format is:

```text
openlv://<sessionId>@1?h=<h>&k=<k>&p=<p>&s=<s>
```

All fields are REQUIRED for deterministic interoperability.

- `sessionId`: 16 URL-safe characters matching `^[A-Za-z0-9_-]{16}$`
- `h`: 16 lowercase hexadecimal characters matching `^[0-9a-f]{16}$`
- `k`: 32 lowercase hexadecimal characters matching `^[0-9a-f]{32}$`
- `p`: signaling protocol identifier
- `s`: signaling server locator

`sessionId` identifies the shared signaling namespace.

`p` and `s` identify how the peers reach the signaling infrastructure.
At the protocol level, `p` and `s` are REQUIRED.
Implementations MAY expose local defaults, but interoperable peers MUST NOT assume them.

`k` provides the shared symmetric key material used for the initial signaling stage before peer public keys have been exchanged.

`h` provides a short hash hint for the advertising peer public key.
In version 1, `h` is derived by serializing the advertising peer encryption public key as a string, hashing the bytes with SHA-256, lower-hex encoding the digest, and truncating to the first 16 hexadecimal characters.

In the current interoperable behavior, `k` is hex-decoded and imported as symmetric handshake key material.

### Signaling Infrastructure

Peers MUST connect to shared signaling infrastructure derived from `p` and `s`.
This signaling infrastructure is untrusted and is used only for encrypted signaling messages and transport negotiation payloads.

This specification does not mandate a single signaling protocol or a purpose-built openlv service.
A conforming signaling server MUST carry byte-equivalent text payloads between peers within a shared session.

This specification is designed to operate over general-purpose signaling services, including publicly available or self-hosted MQTT, NTFY, or similar systems, without requiring those services to implement protocol-specific logic or prior setup.

### Signaling Model

The signaling layer begins with messages encrypted under `k`.
Once the peers have exchanged public keys, signaling continues using peer public-key encryption.

Version 1 therefore uses two signaling encryption modes:

- handshake-key encryption for early bootstrap messages
- peer public-key encryption after public key exchange

### Signaling Frame Format

Each signaling frame is serialized as:

```text
<prefix><recipient><ciphertext>
```

- `prefix`: one ASCII character identifying the encryption mode
- `recipient`: one ASCII character identifying the intended role during signaling
- `ciphertext`: base64 text of the encrypted JSON payload

Version 1 defines:

- `h` as the handshake-key encrypted frame prefix
- `x` as the peer-key encrypted frame prefix
- `h` as the advertising-peer recipient marker
- `c` as the joining-peer recipient marker

In version 1, the character `h` is reused in two different positions: once as a frame prefix and once as a recipient marker.
These meanings are distinguished by position within the frame.

Receivers MUST ignore frames where `recipient` does not match the local role.

### Signaling Messages

After decryption, a signaling payload MUST be valid JSON containing:

- `type`: one of `flash`, `pubkey`, `capabilities`, or `data`
- `payload`
- `timestamp`

The signaling message types have the following meanings:

- `flash`: sent by the joining peer to begin the handshake
- `pubkey`: carries a peer public key
- `capabilities`: acknowledges the previous handshake step, negotiates the transport, and carries optional peer metadata
- `data`: carries post-handshake signaling payloads, including transport negotiation objects

The `capabilities` payload is:

```json
{
  "transports": ["wrtc"],
  "info": {
    "identity": "com.example.wallet",
    "name": "Example Wallet",
    "icon": "data:image/png;base64,..."
  }
}
```

- `transports`: REQUIRED, a non-empty array of transport identifiers in preference order. Version 1 defines `wrtc` (WebRTC) and reserves `ws` (relayed WebSocket). Receivers MUST skip unknown identifiers rather than reject the message.
- `info`: OPTIONAL self-description shown in the other peer's UI. When present, `identity` (a reverse-DNS application identifier) and `name` are REQUIRED; `icon` is OPTIONAL and MAY be a data URI or an image URL. Receivers MUST enforce size limits and MUST treat `info` as untrusted display data: an implementation that renders or fetches `icon` is responsible for validating it first. Senders MUST keep `icon` within the size limits, which are chosen to survive relay message limits.

### Handshake Sequence

The version 1 handshake sequence is:

1. The joining peer sends `flash` to the advertising peer using a handshake-key encrypted frame.
2. The advertising peer sends `pubkey` to the joining peer using a handshake-key encrypted frame.
3. The joining peer records the advertising peer public key and sends `pubkey` using a peer public-key encrypted frame.
4. The advertising peer records the joining peer public key and sends `capabilities` using a peer public-key encrypted frame. This message doubles as the delivery receipt for the joining peer's `pubkey`.
5. The joining peer records the advertising peer capabilities and sends `capabilities` using a peer public-key encrypted frame. This message doubles as the delivery receipt for the advertising peer's `capabilities`.
6. Both peers treat subsequent signaling data as peer public-key encrypted.

Signaling infrastructure is lossy, so each handshake step MAY be re-sent until the next inbound message confirms progress; receivers MUST treat duplicate deliveries as no-ops. A joining peer that continues to receive `capabilities` after completing the handshake MUST answer each duplicate, since its own final message may have been lost.

After the handshake, signaling application payloads MUST be carried in `data` messages inside peer public-key encrypted frames.

### Transport Selection

Both `transports` lists are preference-ordered. The selected transport is the first entry in the advertising peer's list that also appears in the joining peer's list. Both peers compute this independently once they hold both lists; no additional confirmation message is exchanged. If the intersection is empty, the session MUST fail with a no-common-transport error.

### Cryptography

`openlv` uses a two-stage encryption model during session establishment.

The initial signaling stage uses the pre-shared key `k` from the session URI.
This key is used only before peers have exchanged public keys, and allows the first bootstrap messages to be encrypted over untrusted signaling infrastructure.
For current interoperability, the 32-character hexadecimal `k` value is hex-decoded to 16 bytes and imported as an AES-GCM key.

Handshake encryption uses the Web Crypto API AES-GCM implementation with a fresh 12-byte random IV per message.
The serialized encrypted payload is:

```text
base64(iv || ciphertext)
```

After public keys are exchanged, signaling switches to peer public-key encryption.
Each peer generates an asymmetric encryption keypair and encrypts to the other peer's public key.
In the current implementation, this mechanism uses X25519 key agreement (`@noble/curves`) and XSalsa20-Poly1305 authenticated encryption (`@noble/ciphers`), with an ephemeral sender key for each encrypted message.

Peer-encrypted payloads are serialized as:

```text
base64(ephemeralPublicKey || nonce || ciphertext)
```

This same peer-key mechanism is also used to protect payloads exchanged through the negotiated transport layer.

These cryptographic mechanisms define the current interoperable behavior, but future revisions MAY define alternative suites or explicit cryptographic negotiation.

### Transport Negotiation

After the handshake selects a transport, peers negotiate the direct connection through the signaling layer.
These negotiation objects are carried over signaling before the direct transport exists.
The shape of negotiation payloads is owned by the selected transport; receivers MUST ignore unknown negotiation message types.

For the `wrtc` transport, version 1 standardizes carriage of WebRTC negotiation payloads as signaling `data` messages whose payload is one of:

```json
{ "type": "offer", "payload": "<sdp-json-string>" }
```

```json
{ "type": "answer", "payload": "<sdp-json-string>" }
```

```json
{ "type": "candidate", "payload": "<candidate-json-string>" }
```

### Session Envelope

Once transport is established, ordinary application traffic uses the following envelope:

```json
{ "type": "request", "messageId": "<id>", "payload": { "method": "eth_requestAccounts", "params": [] } }
```

```json
{ "type": "ack", "messageId": "<id>" }
```

```json
{ "type": "response", "messageId": "<id>", "payload": ["0x1234567890abcdef1234567890abcdef12345678"] }
```

`messageId` MUST uniquely identify a request within the active session.
A receiver SHOULD send `ack` immediately on receipt of a request, before the (possibly user-interactive) handler produces the `response`.
A `response.messageId` MUST match a prior request.
All session `payload` values are EIP-1193 request or response payloads.
This specification transports those payloads, and does not redefine its semantics.

### Session Resumption

Wallets and dapps MAY persist session state locally to support later resumption.

Persisted state MAY include `sessionId`, `p`, `s`, `k`, local key material, peer public key, and transport configuration.

Resumption in version 1 means re-invoking communication using prior local session material.
It does not guarantee transport continuity.
Implementations MAY need to reconnect to the signaling infrastructure, re-establish peer public-key signaling, and renegotiate transport.

## Rationale

The protocol uses an out-of-band URI because it is easy to transfer, inspect, and encode in both desktop and mobile wallet flows.
It uses signaling infrastructure only for bootstrap and negotiation so ordinary wallet-dapp traffic does not remain dependent on intermediary servers after session establishment.
It carries EIP-1193 messages unchanged to preserve compatibility with existing Ethereum wallet and dapp interfaces.

The specification requires explicit `p` and `s` fields so interoperability does not depend on hidden assumptions about a default signaling service.

The peer model is intentionally asymmetric only during bootstrap and signaling.
Once a transport is established, both peers operate symmetrically and may initiate request/response traffic.

The signaling design is intentionally compatible with general-purpose messaging systems.
This reduces adoption overhead because implementations may use existing public services or deploy their own signaling servers without requiring openlv-specific infrastructure.

## Backwards Compatibility

This is a new protocol and does not change existing EIP-1193 semantics.
Wallets and dapps that do not implement `openlv` remain unaffected.

Version 1 compatibility depends on the `openlv://` URI shape, URI version `@1`, the `sessionId`/`h`/`k` constraints, signaling frame markers, signaling message types, and the session envelope.

## Reference Implementation

An initial implementation is available under the `@openlv/connector`, `@openlv/session`, and `@openlv/transport` packages on npm.

### dApp Implementation

```typescript
import { openlv } from "@openlv/connector";
import { createConfig, http } from "wagmi";
import { mainnet } from "wagmi/chains";

export const wagmiConfig = createConfig({
  chains: [mainnet],
  connectors: [openlv()],
  transports: {
    [mainnet.id]: http(),
  },
});
```

### Wallet Implementation

```typescript
import { connectSession } from "@openlv/session";
import { webrtc } from "@openlv/transport/webrtc";

const session = await connectSession(
  "openlv://...",
  async (message) => {
    return { result: "ok" };
  },
  [webrtc()],
);
```

## Security Considerations

The session URI contains sensitive bootstrap material and MUST be handled as a secret until the handshake completes.
Implementations MUST use fresh randomness for IVs, nonces, ephemeral keys, and generated session identifiers.

Signaling infrastructure is untrusted and can observe metadata such as timing, size, and namespace.
Implementations SHOULD validate decrypted JSON structure and expected message types before acting on payloads.
Implementations SHOULD apply request timeouts and resource limits.
Replay protection is not fully standardized in version 1 and SHOULD be improved in future revisions.

Persisted session state is sensitive and SHOULD be stored using the strongest platform protections available.
Implementations SHOULD allow users to disconnect and delete saved session state.

## Copyright

Copyright and related rights waived via [CC0](../LICENSE.md).
