---
"@openlv/core": minor
"@openlv/signaling": minor
"@openlv/session": minor
"@openlv/transport": minor
---

Breaking: peer-key frames use AES-256-GCM. Each direction has its own key, derived by HKDF-SHA256 from the X25519 shared secret of the two session keys, with the sender's and the recipient's public key in the HKDF info. A frame returned to its sender does not decrypt. The first 32 bytes of a frame are now the sender's session public key instead of a throwaway key, and the nonce is 12 bytes. A receiver rejects a frame from any key other than the recorded peer key. Pairing with 0.2.0 peers breaks.

Keys are plain bytes: `PublicKey` and `KeyPair`. Both encryption stages return a `Cipher` (`createHandshakeCipher`, `createPeerCipher`). The signaling layer owns the peer and exposes it as `peer`, and the transport takes a `cipher`. `EncryptionKey`, `DecryptionKey`, `initEncryptionKeys` and `SymmetricKey` are removed. `SessionConnectionParameters` holds a `KeyPair` and the peer `PublicKey`.
