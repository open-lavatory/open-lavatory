---
"@openlv/modal": patch
"@openlv/provider": patch
"@openlv/session": patch
"@openlv/signaling": minor
---

Introduce support for nostr as signaling protocol.
Deprecate support for `gun` as signaling protocol.
Settings and links that name gun fail with `Unsupported signaling protocol: gun`.
