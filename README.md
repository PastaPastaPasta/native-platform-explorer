# native-platform-explorer

A client-only Dash Platform explorer, powered only by `@dashevo/evo-sdk`
(5.0.0-rc.8). No backend, no indexer, no database: the browser talks directly to
DAPI, verifies proofs locally, and renders live Platform state. Production:
<https://explorer.dashhq.org>.

It started as a sibling of [`pshenmic/platform-explorer`](https://github.com/pshenmic/platform-explorer)
and has its own "Field Manual" design: light and dark modes, Fraunces, Geist and
JetBrains Mono.

## Status

Shipped on `main`:

- Entity pages for identities, contracts, documents, tokens, Platform
  addresses, DPNS names, epochs, evonodes, groups, contested resources and vote
  polls, plus network status, quorums, protocol votes, credits and the shielded
  pool.
- Search by ID, name, name prefix, address, public-key hash, transition hash or
  epoch; saved items; share links that carry the network.
- A SQL query workspace with COUNT/SUM/AVG and GROUP BY, index checks for the
  network's protocol version, a Query Inspector with proof-tree views, and
  deserializer tools.
- An opt-in write mode covering contracts, documents, tokens (including group
  proposals), identities, Platform addresses, DPNS, masternode votes and
  raw-transition broadcast. See [Write mode](#write-mode).

Not shipped: untrusted mode (removed), custom DAPI endpoints for
mainnet/testnet (use a quorum-service override), extension signing (detection
only), translations, and a service worker / CSP / SRI (in progress on the
`chore/hardening` branch).

- Product spec (current): [`docs/PRD.md`](docs/PRD.md)
- Per-PR history with merge commits: [`docs/progress.md`](docs/progress.md)
- Original stage prompts (historical): [`docs/prompts/`](docs/prompts/)

## Development

Node `^22.13.0 || >=24` and pnpm 9.15.9 (pinned in `package.json`).

```
pnpm install --frozen-lockfile
pnpm dev                      # Next.js dev server (webpack) on http://localhost:3000
pnpm lint
pnpm typecheck
pnpm test                     # vitest (CI runs pnpm test:coverage)
NEXT_PUBLIC_BRIDGE_URL=https://bridge.dashhq.org pnpm build   # checks the SDK reference, then exports to out/
pnpm check:bundles            # initial-JavaScript budgets (512 KiB gzip per checked route)
pnpm exec playwright install chromium   # once, before the first e2e run
pnpm e2e                      # Playwright (Chromium) against the export
pnpm generate:sdk-reference   # update the page-to-SDK-call mapping after source changes
```

### Environment variables

Copy `.env.local.example` to `.env.local` and edit. All are public and read at
build time.

| Variable | Purpose | Default |
|---|---|---|
| `NEXT_PUBLIC_DEFAULT_NETWORK` | Initial network: `mainnet`, `testnet` or a devnet name | `testnet` |
| `NEXT_PUBLIC_QUORUM_URL_MAINNET` | Quorum service for mainnet (`https://`, or `http://` for localhost) | SDK default, `https://quorums.mainnet.networks.dash.org` |
| `NEXT_PUBLIC_QUORUM_URL_TESTNET` | Quorum service for testnet | SDK default, `https://quorums.testnet.networks.dash.org` |
| `NEXT_PUBLIC_DISABLE_WRITE_MODE` | `true` makes a read-only deployment: `/wallet` and `/broadcast` show a notice and every link into them is hidden | `false` |
| `NEXT_PUBLIC_RATE_PROVIDER` | DASH/USD rate: `coinbase`, `kucoin` (needs a CORS proxy) or `none` | `coinbase` |
| `NEXT_PUBLIC_WELL_KNOWN_URL` | Extra well-known registry JSON loaded at runtime | unset |
| `NEXT_PUBLIC_BRIDGE_URL` | Bridge for identity create/top-up shortcuts; empty disables them | `https://bridge.dashhq.org` |
| `NEXT_PUBLIC_BASE_PATH` | Path prefix for project-site hosting, e.g. `/native-platform-explorer` | empty (root) |
| `NEXT_PUBLIC_SERVICE_WORKER` | `off` removes the offline service worker and ships its kill switch (see [Hardening](#hardening)) | `on` |

`NEXT_PUBLIC_TRUSTED_MODE` and `NEXT_PUBLIC_DAPI_ADDRESSES_*` are not supported
(see below).

## Connection and proofs

Every session is trusted: the SDK fetches quorum public keys and the DAPI
masternode list from a quorum service when it connects, then verifies
proof-capable responses in the browser. There is no untrusted mode: with
`@dashevo/evo-sdk` (4.0.0-rc.2 then, 5.0.0-rc.8 now) an untrusted SDK fails
every proof-capable query ("Non-trusted mode is not supported in WASM"), and
`proofs: false` aborted the WASM module in rc.2 and is refused
("unproved queries are not supported for this query") in 5.0. So
`NEXT_PUBLIC_TRUSTED_MODE` was removed and a saved `npe:trusted` preference
is discarded.

Settings → Connection (stored in the browser) controls the startup timeout,
the SDK's DAPI connect timeout, request timeout, retries, `banFailedAddress`
and log level, and can point Mainnet or Testnet at another quorum service.
"Clear SDK cache" removes the contracts and protocol version the SDK persists
in localStorage for the network, then reconnects.
Operators can set build defaults with `NEXT_PUBLIC_QUORUM_URL_MAINNET` and
`NEXT_PUBLIC_QUORUM_URL_TESTNET`; like the settings form, they must use
`https://` (`http://` only for localhost), and other values are ignored with a
console warning. Explicit DAPI addresses (the original PRD's
`NEXT_PUBLIC_DAPI_ADDRESSES_*`) are not offered for these networks: sessions
use the quorum service's masternode list, so pointing at another quorum
service is how to use different endpoints. A custom devnet's saved DAPI
addresses are the endpoints its sessions use: since evo-sdk 5.0 explicit
addresses take precedence over the quorum service's list, which is then not
fetched (quorum keys still come from the service). Without saved addresses a
devnet uses the list its quorum service publishes.

The bridge browser tests use the shipped URL as a fixed fixture. Before running
`pnpm e2e`, build with `NEXT_PUBLIC_BRIDGE_URL=https://bridge.dashhq.org pnpm build`,
as CI does. This overrides custom or empty values in `.env.local` for that build.
Custom and disabled bridge URLs are covered by the utility unit tests.

## Write mode

Opt-in. `NEXT_PUBLIC_DISABLE_WRITE_MODE=true` turns it off: `/wallet` and
`/broadcast` then show a write-mode-disabled notice, and the sidebar Write
links, owner shortcuts, token Actions row and contest vote link are hidden.
`/broadcast` lists the operations; each one goes Build → Review → Sign +
broadcast → Result.

**Operations**

| Group | Operations |
|---|---|
| Contracts | register, update |
| Documents | create, replace, delete, transfer, set price, purchase |
| Tokens | mint, burn, transfer, freeze, unfreeze, destroy frozen, pause/resume, set price (single or tiered), direct purchase, claim, config update; group propose and co-sign |
| Identity & credits | create and top up from an asset lock, credit transfer, withdrawal, add or disable keys |
| Platform addresses | send between addresses, fund from your identity, top up an identity, withdraw to Core, fund from an asset lock, create an identity |
| DPNS | register a name (contested names explained) |
| Voting | masternode vote on a contested resource |
| Advanced | broadcast a state transition signed elsewhere |

**Signers.** `/wallet` connects an identity with a bridge backup JSON, a
mnemonic (DIP-13 identity keys `m/9'/coin'/5'/0'/0'/identityIndex'/keyIndex'`,
key indexes 0–15) or a single WIF. Imported keys must match enabled on-chain
keys, and each operation signs only with a key of the purpose and security
level Platform requires. Extension support is detection-only until the
`dash-platform-extension` public API stabilises. Operations that don't use the
connected identity take their keys in the form and keep them only for that
operation: Platform address keys, the one-time asset-lock key, a masternode
voting key with its ProTxHash, or none for an already-signed transition.

**Safety model.**
- Nothing secret is persisted. Local signers keep keys in tab memory and wipe
  owned byte arrays on disconnect, after ten minutes without user input
  (visible or hidden tab), when leaving `/wallet` and `/broadcast`, and on
  unload. Automatic clears keep only the signer kind, public identity ID and
  network as a reconnect hint, shown only on that network. JavaScript strings and SDK-internal copies cannot be
  reliably zeroed.
- Secret fields are masked text fields, so browsers don't offer to save them,
  and Review never shows them.
- Review freezes the inputs and shows the key that will sign; signing uses only
  that key. Mainnet requires typing `MAINNET`; destructive operations need an
  extra acknowledgement.
- Writes are refused when the SDK session's protocol version differs from the
  network's.
- An asset-lock create, top-up or fund is refused before submission unless
  the asset-lock key controls the locked output (checked against the proof's
  transaction, or for a chain-lock proof the transaction fetched from Insight
  and matched to its txid).
- Errors before submission are "not submitted". Anything after submission
  starts is "outcome unknown", with no Retry: check the affected identity or
  address first, because a retry may spend twice.

**Tested.** Run end to end on testnet through the served export, with proved
read-back: every Platform-address operation, asset-lock identity create and
top-up, raw broadcast (#47); the token operations including group
propose/co-sign (#48); contract register and update, document create, replace,
delete, transfer, set price and purchase, identity credit transfer, withdrawal,
adding and disabling keys, and non-contested DPNS registration
(`fix/discrepancies-l`; document transfer, set price and purchase needed a
revision fix found in that run). Not yet broadcast live: masternode votes (no
voting key was available), contested DPNS registrations, and pre-programmed or
once-per-identity token claims. These are covered by unit and real-WASM tests.
No write has been tested on mainnet.

Without a Core wallet, create or top up an identity through the bridge at
`https://bridge.dashhq.org` (Mainnet and Testnet): choose Create New Identity,
or Manage Identity → Top Up Identity and enter the identity there; the
shortcut passes the selected network only. Import the bridge's backup JSON
to connect an identity here. Other networks require a separate bridge setup.
The explorer does not build asset-lock transactions. After an external top-up,
refresh the identity page to check the balance. See [`/about`](src/app/about/page.tsx)
for the proof and privacy explainer.

## SDK reference

`/sdk-reference` lists the page-specific SDK calls reachable through each
route's components, hooks, and actions. Filter by page, method, or source hook.
The checked-in mapping is generated from TypeScript symbols and the pinned SDK;
conditional calls are included, while shared connection setup and methods on
returned SDK objects are outside its scope. The reference does not execute SDK
queries. `pnpm build` rejects a stale mapping; update it with
`pnpm generate:sdk-reference`. Generator regression tests run in CI.

## Deploy

GitHub Pages is the only deploy target (Vercel and IPFS from the original PRD
were not pursued). The build output is a plain `out/` directory. CI resolves the current GitHub Pages configuration (including custom
domains) and builds once at that deployment prefix, runs lint, type checking, unit coverage and Chromium
browser checks, then preserves `validated-pages`. Deployment downloads that
exact successful CI artifact for the current `main` commit. Failed or
superseded builds are not deployed. No rebuild happens during deployment.

Fraunces and JetBrains Mono are bundled locally with their OFL licenses;
Geist is bundled by its npm package. Builds do not fetch Google Fonts.
`pnpm build` copies the complete font licenses (and `.nojekyll`) into `out/`.
The package manager is pinned in `package.json`.

The current custom domain uses the root prefix. To reproduce it locally, omit
`NEXT_PUBLIC_BASE_PATH` from the commands below. Project-prefix hosting is also covered:

```sh
NEXT_PUBLIC_BRIDGE_URL=https://bridge.dashhq.org NEXT_PUBLIC_BASE_PATH=/native-platform-explorer pnpm build
NEXT_PUBLIC_BASE_PATH=/native-platform-explorer pnpm e2e
```

`pnpm e2e` serves `out/` on port 3100; set `NPE_PREVIEW_PORT` to use another.

### Hardening

`pnpm build` runs `scripts/harden-export.mjs` after `next build`. It rewrites
`out/` in place:

- **Content Security Policy.** GitHub Pages cannot send headers, so each page
  gets a `<meta http-equiv="Content-Security-Policy">` whose `script-src` lists
  the SHA-256 of that page's inline scripts (no `'unsafe-inline'` for
  scripts). `'wasm-unsafe-eval'` lets the SDK compile its WASM, in a `blob:`
  worker (`worker-src 'self' blob:`). `connect-src` allows any `https:` origin,
  because DAPI nodes are arbitrary hosts such as `https://68.67.122.1:1443`,
  plus `http://localhost:*` and `http://127.0.0.1:*` for local quorum services.
  `style-src` needs `'unsafe-inline'`: Chakra UI (emotion) writes `<style>`
  elements and style attributes at runtime. A meta policy cannot set
  `frame-ancestors`, `sandbox` or `report-uri`, so framing cannot be blocked on
  this host.
- **Subresource Integrity.** Script, stylesheet and script-preload tags carry
  `integrity`. The webpack runtime is patched with the SHA-256 of every chunk
  and sets `integrity` on the chunks it loads later, the SDK chunk included; a
  chunk name missing from the map (client navigation reads them from RSC
  payloads) gets a hash nothing matches, so it is refused. The proof parser
  fetches its WASM with its hash from the same map. The patched runtime is
  renamed after its content. The build fails if Next's runtime no longer has
  the expected shape.
- **`integrity.json`.** The SRI hash of every file in `out/` plus the commit,
  build ID, base path, `NEXT_PUBLIC_*` settings and toolchain. Next's build ID
  is the git commit plus a digest of the base path and `NEXT_PUBLIC_*` settings
  (random for a tree with uncommitted changes; override with `NPE_BUILD_ID`),
  so it changes whenever the output does and Next reloads pages whose
  navigation payloads come from another build. Client module IDs are
  hashed without the checkout directory (`PortableModuleIdsPlugin` in
  `next.config.mjs`), so two builds of a commit are byte-identical wherever
  they run. `pnpm verify:integrity <site URL>` compares a local
  build with a deployment; `/about#verify` describes the steps for users.
- **Offline service worker** (`sw.js`). Only same-origin files inside the base
  path are handled; DAPI, quorum, rate and other cross-origin requests never
  touch it. Pages and other unhashed files are network-first (revalidated, so
  the HTTP cache cannot serve HTML that names deleted chunks) and fall back to
  the cache, then to `/offline/`; only pages and payloads that name the
  worker's own build are cached. `/_next/static` files are cache-first, cached
  on first use (the SDK chunk and WASM are never precached) and stored only if
  their bytes match this build's SRI hash. Caches are named per base path and
  build and the old ones are removed when a new worker activates. A new worker
  waits: a page from an older build shows "A new version of the explorer is
  available" and activates it on Reload; a page already on the new build
  switches silently.

To switch the worker off, build with `NEXT_PUBLIC_SERVICE_WORKER=off`. Pages
then stop registering it and unregister an existing one, and `sw.js` becomes a
kill switch (`scripts/sw/unregister.js`). Browsers fetch `sw.js` on navigation
(bypassing the HTTP cache), install it, and it deletes the caches and the
registration without reloading open pages. Keep shipping the kill switch for a
while: a browser that has not visited since still has the old worker until it
fetches the new `sw.js`. Re-enabling later is an ordinary deploy.

Rolling back to an earlier commit that also has the worker is an ordinary
deploy: its pages name another build, so open tabs offer a reload. Rolling
back past the commit that introduced the worker needs one extra step: that
build has no `sw.js`, and a failed update check leaves installed workers in
place, so copy `scripts/sw/unregister.js` to `public/sw.js` in the rollback.

The worker's scope is the base path. Do not deploy at the root of a shared
origin such as `<user>.github.io`: there it would also handle sibling
project sites' navigations, and serve this site's offline page for them.

## Build plan (original)

This is the original six-stage plan the project was built from. It is kept for
history; later work is recorded in [`docs/progress.md`](docs/progress.md) and
the current spec is [`docs/PRD.md`](docs/PRD.md).

| Stage | Delivers | Prompt |
|---|---|---|
| 1 | Foundation — Next.js shell, theme port, SDK provider, empty pages | [`stage-1-foundation.md`](docs/prompts/stage-1-foundation.md) |
| 2 | Single-entity detail pages + real search | [`stage-2-detail-pages.md`](docs/prompts/stage-2-detail-pages.md) |
| 3 | Browse surfaces + live home dashboard | [`stage-3-browse-home.md`](docs/prompts/stage-3-browse-home.md) |
| 4 | Governance, groups, protocol, network pages | [`stage-4-governance.md`](docs/prompts/stage-4-governance.md) |
| 5 | Proof verification UX | [`stage-5-proofs.md`](docs/prompts/stage-5-proofs.md) |
| 6 | Opt-in write mode — wallet adapters + broadcast console | [`stage-6-write-mode.md`](docs/prompts/stage-6-write-mode.md) |

## License

MIT
