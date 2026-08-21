---
"@openlv/transport": patch
---

A failed `setup` now closes the channel via scope instead of leaking it, and the WebRTC transport detaches all connection and data-channel listeners and closes the peer connection on teardown.
