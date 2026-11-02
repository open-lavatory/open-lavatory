---
"@openlv/core": minor
"@openlv/signaling": minor
"@openlv/session": minor
"@openlv/transport": minor
---

Rework peer-key frames to use AES-256-GCM, derived by HKDF-SHA256 from the X25519 shared secret of the two session keys.
`PublicKey` and `KeyPair` are plain bytes & encryption stages moved to `Cipher` (`createHandshakeCipher`, `createPeerCipher`).
`EncryptionKey`, `DecryptionKey`, `initEncryptionKeys` and `SymmetricKey` are removed.
`SessionConnectionParameters` holds a `KeyPair` and the peer `PublicKey`.
