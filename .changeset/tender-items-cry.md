---
"@openlv/transport": minor
"@openlv/provider": minor
"@openlv/session": minor
---

Breaking: a wallet's request handler returns a full JSON-RPC 2.0 response. The dApp rejects a bare result.

New session message `failed`. The receiver sends it when its handler throws. It carries no detail.
