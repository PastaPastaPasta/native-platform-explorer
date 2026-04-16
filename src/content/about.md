# Native Platform Explorer

## What this is

A client-only block explorer for Dash Platform, powered exclusively by
[`@dashevo/evo-sdk`](https://github.com/dashevo/platform/tree/master/packages/js-evo-sdk).
There is no API server, no database, and no indexer behind this site — every
value you see has been fetched from a masternode's DAPI endpoint by the WASM
SDK running in your browser, and (by default) verified against a prefetched
set of quorum public keys.

It is a deliberate, reduced-scope sibling of
[`platform-explorer`](https://platform-explorer.com). Because it has no
indexer it cannot browse every identity, contract, token, block, or
transaction. In exchange, it can ship as a single static bundle that anyone
can host, every response carries a cryptographic proof, and there is no
middleman between you and the network.

## How it works

Your browser connects directly to DAPI (Dash Platform's gRPC-web surface)
and asks for data. In trusted mode the SDK also asks DAPI for a GroveDB
Merkle proof; the WASM engine then verifies that proof locally against
quorum public keys fetched when the SDK connected. If verification passes,
the value gets a green "Verified" chip next to it. If it fails, you see a
red banner at the top of the page and the option to view the data
unverified. If the SDK method has no proof variant (e.g. `system.status`),
we label it honestly as "No proof".

## Proofs {#proofs}

- **Verified** (green check): the WASM SDK verified a proof for this value
  against the current quorum public keys.
- **No proof** (gray): the SDK method doesn't expose a proof variant (mostly
  status / quorum / rate endpoints).
- **Unverified — trusted mode off** (yellow): you disabled trusted mode in
  Settings; responses are fetched without proofs.
- **Proof failed** (red): the SDK received a response but verification
  rejected it. This usually means a DAPI endpoint is misbehaving or
  out-of-date. You can retry with proofs, switch networks, or view the
  unverified payload for inspection.

## Enumeration {#enumeration}

Dash Platform's SDK does not expose "list all identities", "list all
contracts", "list all tokens", "list all documents", or "list all
transactions" primitives. This explorer honours that constraint — wherever
you'd expect a browseable list, we either show a seeded list (paste the
IDs you care about) or, where the SDK has a real list primitive (documents
within a contract, epochs by index, DPNS labels by prefix, protocol votes,
contested resources, groups in a contract), we show a real, paginated
browser.

This is the honest answer. A "list all tokens" page would require custom
indexing, and this project is explicitly index-free.

## Privacy

- Your queries go directly from your browser to DAPI. We never see them.
- No analytics, no telemetry.
- The session-viewed-identities log (opt-in) is stored only in your
  browser's localStorage and never transmitted.

## Credits

- [`dashevo/platform`](https://github.com/dashevo/platform) — Dash Platform.
- [`@dashevo/evo-sdk`](https://github.com/dashevo/platform/tree/master/packages/js-evo-sdk) — the TypeScript SDK that powers every query here.
- [`platform-explorer`](https://github.com/pshenmic/platform-explorer) — the indexer-backed sibling whose visual language we mirror.
