# @openlv/compat-tests

Backwards-compatibility E2E suite. On every PR it connects the **branch build**
of the openlv stack to the **latest published npm release** — in both roles —
over real infrastructure:

| test | dApp (session host) | wallet (joins from URL) |
| --- | --- | --- |
| `src/dapp.compat.test.ts` | branch (workspace `dist/`) | `npm:@openlv/*@latest` |
| `src/wallet.compat.test.ts` | `npm:@openlv/*@latest` | branch (workspace `dist/`) |

No mocks: real ntfy.sh signaling, a real Chromium `RTCPeerConnection`
(vitest browser mode via Playwright), and a full request/response round trip in
both directions. If a PR breaks the `openlv://` URL grammar, the signaling
handshake, the encryption layer, or the transport negotiation in a
backwards-incompatible way, one of the two directions fails.

## How the two versions coexist

- The branch side resolves through `workspace:*` dependencies, whose `exports`
  point at `dist/` — so **build first** (`pnpm build` at the repo root).
- The published side is installed under npm aliases (`latest-session` →
  `npm:@openlv/session@...`, same for `core`/`signaling`/`transport`) and its
  transitive `@openlv/*` dependencies come from the registry, never from the
  workspace — it is exactly what `pnpm add @openlv/session` gives an app today.
- `package.json` + `pnpm-lock.yaml` pin the last release these tests ran
  against. The `update:latest` script re-resolves the npm `latest` dist-tag and
  rewrites that pin; CI runs it before every compat run, so PRs always test
  against the current release even if the committed pin is stale. Run it
  locally after a release (and commit the bump) to keep local runs honest.

## Running locally

```sh
pnpm build                          # branch dist/ the workspace deps point at
pnpm --dir tests run update:latest  # optional: re-pin npm latest
pnpm test:compat                    # from the repo root (or --dir tests test:compat)
```

`test:compat` is intentionally not named `test`, so `pnpm -r test` (the unit
suite) doesn't pull in network-heavy compat runs; CI runs it as the separate
`Compat` job in `.github/workflows/verify.yml`.

The suite serializes its test files and keeps generated (random) session ids,
so parallel CI runs can't collide on the shared ntfy.sh topics.
