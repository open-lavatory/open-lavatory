---
"@openlv/core": minor
"@openlv/signaling": minor
"@openlv/session": minor
"@openlv/provider": minor
"@openlv/connector": minor
---

Add session resumption: `createSession` resumes from `session.getConnectionParameters()` on its saved transport, and `config.resume` saves and resumes the pairing in the connector with its STUN and TURN configuration
