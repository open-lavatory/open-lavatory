---
"@openlv/transport": minor
"@openlv/session": minor
---

Breaking wire change for 0.x: an `answer` carries the `messageId` of the offer request it answers, and the offering peer drops an `answer` without it or with another, so a peer on an earlier 0.x release cannot pair with this one
