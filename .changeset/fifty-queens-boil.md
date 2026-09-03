---
"@openlv/session": patch
---

Signal subscriptions and teardown are registered in a scope so session cleanup is reliable when connecting fails partway through.
