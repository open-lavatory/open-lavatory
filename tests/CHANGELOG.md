# @openlv/e2e

## 0.1.0

### Minor Changes

- 891501c: Migrated from Eventemitter-based to observables. Along the way deprecating `state_change` and `getState()` with `get()`, `subscribe()` and `until()`. Also renaming previously uppercase `SESSION_STATE` to `SessionStatus`, same for singaling and transport.

## 0.0.1

### Patch Changes

- 53f38fa: Lint the codebase and update vocabulary to disfavor shorthands
