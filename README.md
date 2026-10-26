# native-platform-explorer

A client-only Dash Platform block explorer, powered exclusively by `@dashevo/evo-sdk`. No backend, no indexer, no database — the browser speaks directly to DAPI, verifies proofs locally, and renders live Platform state.

Designed as a sibling of [`pshenmic/platform-explorer`](https://github.com/pshenmic/platform-explorer), with a dark theme, the `#008DE4` brand, and glassmorphic cards. Its shipped typography uses Fraunces, Geist, and JetBrains Mono.

## Status

The explorer includes entity details, schema-aware SQL and aggregate queries,
proof inspection, governance views, and opt-in write tools. Write operations
use the SDK's identity-signing bridge; availability depends on the connected
signer's eligible keys and the SDK's operation support. Unsupported funding,
raw-broadcast and extension paths are labeled in the interface.

- Full product requirements: [`docs/PRD.md`](docs/PRD.md)
- Per-stage progress + commit SHAs: [`docs/progress.md`](docs/progress.md)
- Implementation plan, broken into 6 sequential stages: [`docs/prompts/`](docs/prompts/)

## Development

```
pnpm install
pnpm dev       # Next.js dev server on http://localhost:3000
pnpm build     # static export to out/
pnpm lint
pnpm typecheck
pnpm test      # vitest
pnpm e2e       # playwright
pnpm generate:sdk-reference  # update the page-to-SDK-call mapping after source changes
```

Environment variables live in `.env.local.example` — copy to `.env.local`
and edit. The most important one is `NEXT_PUBLIC_DISABLE_WRITE_MODE=true`
for kiosk / read-only deployments: it hides `/wallet` and `/broadcast`
while keeping the rest of the explorer identical.

## Connection and proofs

Every session is trusted: the SDK fetches quorum public keys and the DAPI
masternode list from a quorum service when it connects, then verifies
proof-capable responses in the browser. There is no untrusted mode. With the
pinned `@dashevo/evo-sdk` (4.0.0-rc.2, and still 5.0.0-rc.8), an untrusted
SDK fails every proof-capable query ("Non-trusted mode is not supported in
WASM"), and `proofs: false` aborted the WASM module in rc.2 and is refused
("unproved queries are not supported for this query") in 5.0, so
`NEXT_PUBLIC_TRUSTED_MODE` was removed and a saved `npe:trusted` preference
is discarded.

Settings → Connection (stored in the browser) controls the startup timeout,
the SDK's DAPI connect timeout, request timeout, retries, `banFailedAddress`
and log level, and can point Mainnet or Testnet at another quorum service.
Operators can set build defaults with `NEXT_PUBLIC_QUORUM_URL_MAINNET` and
`NEXT_PUBLIC_QUORUM_URL_TESTNET`; like the settings form, they must use
`https://` (`http://` only for localhost), and other values are ignored with a
console warning. Explicit DAPI addresses (the PRD's
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

Opt-in. The explorer does not persist mnemonic, WIF, or backup secrets.
Local adapters keep secrets in tab memory and wipe owned byte arrays on
disconnect, after ten minutes without user input (whether the tab is visible
or hidden), when navigating away from `/wallet` and `/broadcast`, or on unload.
Automatic clears keep only the signer kind and public identity ID as a
reconnect hint.
An in-flight operation retains its SDK signing objects until it settles.
JavaScript strings and SDK internal copies cannot be reliably zeroed.
Extension support is detection-only until the
`dash-platform-extension` public API stabilises. See [`/about`](src/app/about/page.tsx)
for the full proof + privacy explainer.

Operations that do not use the connected identity take their keys in the
form and keep them only for that operation: Platform address keys (send between
addresses, top up an identity, withdraw to a Core address, create an identity
from address credits), the one-time asset-lock key (create or top up an
identity, or fund an address, from an asset-lock proof made by a Core wallet),
and a masternode voting key with its ProTxHash (masternode votes, also linked
from each open contest). The explorer does not build asset-lock transactions.
A new identity's keys are derived from a mnemonic on the DIP-13 identity paths
(so connecting that mnemonic on `/wallet` finds them) or entered as WIFs, and
keys another identity already uses are refused before anything is signed.
Address amounts are exact integer credits checked against the protocol's
minimums; the SDK fetches each input address's nonce. Advanced → Broadcast a
signed state transition decodes hex or base64 locally, shows its type, owner,
signing key ID and hash, and broadcasts the same bytes; DAPI's "already in
mempool/chain" is reported as already submitted, not as a failure.

Without a Core wallet, create or top up an identity through the bridge at
`https://bridge.dashhq.org` (Mainnet and Testnet): choose Create New Identity,
or Manage Identity → Top Up Identity and enter the identity there; the
shortcut passes the selected network only. Import the bridge's backup JSON
to connect an identity here. Other networks require a separate bridge setup.
Operators can override the HTTPS base URL with `NEXT_PUBLIC_BRIDGE_URL` at
build time, or set it empty to disable the shortcuts. After an external top-up,
refresh the identity page to check the balance.

## SDK reference

`/sdk-reference` lists the page-specific SDK calls reachable through each
route's components, hooks, and actions. Filter by page, method, or source hook.
The checked-in mapping is generated from TypeScript symbols and the pinned SDK;
conditional calls are included, while shared connection setup and methods on
returned SDK objects are outside its scope. The reference does not execute SDK
queries. `pnpm build` rejects a stale mapping; update it with
`pnpm generate:sdk-reference`. Generator regression tests run in CI.

## Deploy

The build output is a plain `out/` directory. CI resolves the current GitHub Pages configuration (including custom
domains) and builds once at that deployment prefix, runs lint, type checking, unit coverage and Chromium
browser checks, then preserves `validated-pages`. Deployment downloads that
exact successful CI artifact for the current `main` commit. Failed or
superseded builds are not deployed. No rebuild happens during deployment.

Fraunces and JetBrains Mono are bundled locally with their OFL licenses;
Geist is bundled by its npm package. Builds do not fetch Google Fonts.
CI includes the complete font licenses in the validated deployment artifact.
The package manager is pinned in `package.json`.

The current custom domain uses the root prefix. To reproduce it locally, omit
`NEXT_PUBLIC_BASE_PATH` from the commands below. Project-prefix hosting is also covered:

```sh
NEXT_PUBLIC_BRIDGE_URL=https://bridge.dashhq.org NEXT_PUBLIC_BASE_PATH=/native-platform-explorer pnpm build
cp src/styles/fonts/Fraunces-OFL.txt src/styles/fonts/JetBrainsMono-OFL.txt out/
NEXT_PUBLIC_BASE_PATH=/native-platform-explorer pnpm e2e
```

## Build plan

The implementation is split into 6 stages. Each is designed to be shippable on its own, so the project has a usable state after every stage.

| Stage | Delivers | Prompt |
|---|---|---|
| 1 | Foundation — Next.js shell, theme port, SDK provider, empty pages | [`stage-1-foundation.md`](docs/prompts/stage-1-foundation.md) |
| 2 | Single-entity detail pages + real search | [`stage-2-detail-pages.md`](docs/prompts/stage-2-detail-pages.md) |
| 3 | Browse surfaces + live home dashboard | [`stage-3-browse-home.md`](docs/prompts/stage-3-browse-home.md) |
| 4 | Governance, groups, protocol, network pages | [`stage-4-governance.md`](docs/prompts/stage-4-governance.md) |
| 5 | Proof verification UX — the differentiator | [`stage-5-proofs.md`](docs/prompts/stage-5-proofs.md) |
| 6 | Opt-in write mode — wallet adapters + broadcast console | [`stage-6-write-mode.md`](docs/prompts/stage-6-write-mode.md) |

Each prompt is self-contained and intended to be handed to a coding agent. Run them sequentially; at the end of stage 6 the project matches the PRD.

## License

MIT
