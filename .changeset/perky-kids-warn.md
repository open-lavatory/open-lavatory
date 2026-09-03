---
"@openlv/signaling": patch
---

Handshake messages are now resent on an interval until the state machine observes progress, with a 30-second deadline after which the signaling layer enters `ERROR`. Teardown now runs through a scope so channels are always torn down, and the gundb channel's `subscribe` returns an unsubscribe function.
