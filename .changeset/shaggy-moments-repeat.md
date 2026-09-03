---
"@openlv/connector": patch
---

`disconnect` and `onDisconnect` both route through `provider.closeSession()`, `connect` reuses `getAccounts()`, and the duplicated disconnect helper is removed.
