---
"@openlv/provider": patch
---

Failed connections now clear the stuck session, surface the underlying error to UI consumers, and best-effort close the failed session. Stored WebRTC settings are converted to the current `WebRTCConfig` shape.
