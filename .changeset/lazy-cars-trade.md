---
"@openlv/react-native": minor
"@openlv/connector": minor
"@openlv/signaling": minor
"@openlv/transport": minor
"@openlv/provider": minor
"@openlv/session": minor
"@openlv/modal": minor
"@openlv/core": minor
"@openlv/e2e": minor
---

Migrated from Eventemitter-based to observables. Along the way deprecating `state_change` and `getState()` with `get()`, `subscribe()` and `until()`. Also renaming previously uppercase `SESSION_STATE` to `SessionStatus`, same for singaling and transport.
