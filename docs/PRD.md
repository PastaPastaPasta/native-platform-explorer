# Native Platform Explorer — Product Requirements Document (PRD)

> A client-only Dash Platform (Evolution) explorer, powered only by `@dashevo/evo-sdk`.
> No backend, no indexer. Production: <https://explorer.dashhq.org>.

This document describes the product as it ships on `main`. Where a behaviour
was decided against or deferred, it says so. Per-PR history is in
[`progress.md`](progress.md); design notes for individual areas are in
[`design/`](design/).

## Revision history

| Date | Change |
|---|---|
| 2026-04 | Original PRD, written before implementation. It targeted Next 14 / React 18, evo-sdk 3.x, Montserrat/Open Sans/Roboto Mono, a dark-only theme copied from `platform-explorer`, `[param]` route segments, `react-markdown`, an optional untrusted mode, `NEXT_PUBLIC_DAPI_ADDRESSES_*`, an extension-first signer, and Vercel/IPFS deploys. The full text is in git history (`git log -- docs/PRD.md`). |
| 2026-10-26 (later) | Discrepancy fixes from the #49 audit and the first live run of contract, document, identity-signed and DPNS writes through the UI (`fix/discrepancies-l`): write entry points hidden in read-only builds, asset-lock key checked before submission, token writes in the SDK reference, testnet aggregate presets, seeded holders through the proof layer, no `trusted` flag in share links; §13.4, §18 and §19 updated. |
| 2026-10-26 | Rewritten to match what shipped through PR #48. Main differences from the original: Next.js 16 / React 19 and evo-sdk 5.0.0-rc.8; Fraunces/Geist/JetBrains Mono with light and dark modes; static-export query-parameter routes (`/identity?id=`); trusted-only sessions (untrusted mode removed); a quorum-service override instead of custom DAPI endpoints for mainnet/testnet; devnets; the SQL query workspace, Query Inspector, `/tools`, `/saved`, `/sdk-reference` and `/network/shielded`; the full write surface (contracts, documents, tokens, identities, Platform addresses, DPNS, masternode votes, raw broadcast); the well-known registry with network scope and remote loading; connection settings; GitHub Pages as the only deploy target; the original 12-facade list replaced by the generated page→SDK-call mapping. |

---

## 1. Summary

Native Platform Explorer is a static web app. Every value it shows comes from
`@dashevo/evo-sdk` (a TypeScript wrapper around the Rust/WASM Dash Platform
SDK) running in the user's browser, which talks to DAPI on Platform's
masternodes and verifies GroveDB proofs locally.

**No backend, no indexer.** There is no API server, no database and no
scheduled job. If a feature needs one, the feature is dropped. The only
non-DAPI requests the browser makes are listed in §14.10.

Because the SDK cannot enumerate all identities, contracts, tokens, blocks or
transactions, the explorer is search-first and smaller in scope than the
indexer-backed [`platform-explorer`](https://github.com/pshenmic/platform-explorer).
In exchange it offers:

- **Proof-verified data.** Every session is trusted: the SDK verifies
  proof-capable responses against quorum public keys from a quorum service.
- **No operating cost.** A static `out/` directory served from GitHub Pages.
- **Live data.** No indexing lag.
- **Opt-in write mode.** The SDK's write methods are exposed behind a review
  and signing flow, with keys held only in the tab.

**Target platforms:** desktop and mobile web. **License:** MIT.

---

## 2. Goals and non-goals

### 2.1 Goals

1. An SDK-only exploration UI for Dash Platform state.
2. Expose the SDK's read surface wherever it can be rendered usefully.
3. Expose the SDK's write surface behind an opt-in review/sign flow.
4. Run from static hosting.
5. Verify proofs in the browser and show the proof state of each value.
6. Deep links: every view is a URL that fetches what it needs on load, including
   tab, filter and paging state.

### 2.2 Non-goals

1. **No global enumeration, ranking or trending pages.** The SDK cannot list
   all identities, contracts, tokens or cross-contract documents, and the
   explorer does not index them.
2. **No historical time-series charts** (tx/hour, TPS). These need an indexer.
3. **No aggregate statistics** (total transactions, richest identities).
4. **No custom backend of any kind.**
5. **No key custody.** Keys are typed or imported per session and never
   persisted (§13).
6. **No accounts, email or notifications.**
7. **No internationalization in v1** (§14.9).

### 2.3 Trade-offs against `platform-explorer`

| Capability | `platform-explorer` | `native-platform-explorer` |
|---|---|---|
| Browse all blocks / transactions | ✓ (indexer) | ✗ |
| Browse all identities / contracts / tokens | ✓ | ✗ (search, well-known registry, saved items) |
| Search by DPNS name or prefix | ✓ | ✓ |
| Search by identity / contract / token / transition / address / public-key hash | ✓ | ✓ |
| Documents within a contract + type | ✓ | ✓ (`documents.query`, filters, cursors) |
| SQL-style queries and COUNT/SUM/AVG | ✗ | ✓ (`/query`) |
| Contract version history | ✓ | ✓ for contracts with `keepsHistory` (10 newest) |
| Token holders | ✓ (indexed) | Seeded list only (§8.6) |
| Epoch and evonode proposer data | ✓ | ✓ |
| Shielded pool state | ✗ | ✓ |
| Time-series charts | ✓ | ✗ |
| Broadcast state transitions | ✓ (API) | ✓ (SDK, signed in the browser) |
| Proof verification in the UI | ✗ | ✓ |

---

## 3. Target users

1. Developers building on Platform: contracts, documents, queries, proofs.
2. Token issuers and holders: supply, rules, prices, balances, token writes.
3. DPNS users: availability, contests, resolution, registration.
4. Masternode operators: proposed blocks, protocol votes, contested-resource votes.
5. Governance participants: contested resources, vote polls, groups.
6. Anyone following an identity, name or contract between related entities.

---

## 4. Architecture

```
┌───────────────────────────────────────────────────────────────────┐
│ BROWSER                                                           │
│  ┌──────────────────────┐      ┌───────────────────────────────┐  │
│  │ Next.js 16 static    │ ───► │ @dashevo/evo-sdk 5.0.0-rc.8   │  │
│  │ export (App Router,  │      │  └ @dashevo/wasm-sdk (WASM)   │  │
│  │ all pages client)    │ ◄─── │     proof verification        │  │
│  │ React Query · nuqs   │      └──────┬──────────────┬─────────┘  │
│  └──────────────────────┘             │              │            │
└───────────────────────────────────────┼──────────────┼────────────┘
                                        │ gRPC-web     │ HTTPS
                                        ▼              ▼
                           ┌─────────────────────┐  ┌──────────────────────────┐
                           │ DAPI on masternodes │  │ Quorum service           │
                           │ (Drive / Tenderdash)│  │ quorums.<net>.networks…  │
                           └─────────────────────┘  │ quorum keys + node list  │
                                                    └──────────────────────────┘
```

- **Static export.** `next.config.mjs` sets `output: 'export'` and
  `trailingSlash: true`; there is no Node runtime at deploy time.
- **Trusted sessions only.** On connect, the SDK fetches quorum public keys
  (and, for mainnet/testnet, the DAPI masternode list) from the quorum service,
  then verifies proof-capable responses in WASM.
- **Lazy SDK.** The SDK module is imported at session start, not in route
  bundles, so the shell, query editor, wallet and broadcast forms are usable
  while it loads (§15.1).
- **Deep link → SDK calls.** Each route reads its query parameters and calls the
  SDK on mount.

---

## 5. Tech stack

Versions from `package.json`.

| Concern | Choice |
|---|---|
| Framework | Next.js 16.3.8, App Router, `output: 'export'`, built with Webpack (`next build --webpack`) for async WASM and raw-Markdown handling |
| UI | React 19.3.0, Chakra UI 2.8, Emotion, Framer Motion 11 |
| Language | TypeScript, strict; ESM-only (`"type": "module"`) |
| Styling | Chakra theme (`src/styles/theme.ts`, `colors.ts`) plus Sass (`global.scss`, `mixins.scss`) |
| Data fetching | TanStack Query 5 |
| URL state | nuqs 2 (one `NuqsAdapter`, in `Providers.tsx`) |
| Numbers | bignumber.js for credits/DASH formatting; native bigint for amounts in writes |
| Avatars | `minidenticons`, rendered as `<img>` |
| Fonts | Fraunces and JetBrains Mono (local, OFL), Geist (`geist` package) |
| Proof parsing | A vendored GroveDB proof parser compiled to WASM (`src/lib/grovedb-proof-parser`, `public/wasm/`), loaded on demand |
| Tests | Vitest + Testing Library + happy-dom; Playwright (Chromium) against the exported site |
| Lint | ESLint 9 flat config with `eslint-config-next` |
| Package manager | pnpm 9.15.9 (pinned via `packageManager`); Node `^22.13.0 \|\| >=24` |

`d3` and `@tanstack/react-table` are still listed in `package.json` but are not
imported by `src/`; tables and the proposer bars are plain Chakra components.
`react-markdown` was never added: `/about` is a TSX page.

---

## 6. SDK envelope

This section is the floor for product scope: every feature maps to an SDK call.

### 6.1 Version and facades

The app pins `@dashevo/evo-sdk` **5.0.0-rc.8** (and its `@dashevo/wasm-sdk`
5.0.0-rc.8), which matches testnet's Drive 5.0.0-rc.8 (protocol 14) and still
serves mainnet (protocol 13). The bundled build version is shown in the footer,
Settings → Build info and `/about`.

Facades the app calls: `addresses`, `contracts`, `documents`, `dpns`, `epoch`,
`group`, `identities`, `protocol`, `shielded`, `stateTransitions`, `system`,
`tokens`, `voting`, plus `sdk.version()`, the `wallet` utilities and WASM
classes such as `AssetLockProof`, `StateTransition`, `PrivateKey` and
`Identifier`. The authoritative per-page list is generated from source into
`src/data/sdk-reference.json` and rendered at `/sdk-reference` (§17).

New 5.0 facades that the app does not use yet: `contractGroups`,
`encryptedFor`, `moderationCharters`, contract moderation and fee pots,
`documents.{chained,composite,ranked,having}`,
`identities.updateKeyLimits` / `keysRemainingBudgets`.

### 6.2 Trusted sessions only

Every session is trusted. Untrusted mode was removed in #40: with the WASM SDK,
an untrusted `EvoSDK` fails every proof-capable query ("Non-trusted mode is not
supported in WASM"), and `proofs: false` aborted the WASM module in 4.0.0-rc.2
and is refused with a Config error in 5.0. `NEXT_PUBLIC_TRUSTED_MODE` and the
Settings toggle are gone, and a stored `npe:trusted` is deleted on load. Query
keys still carry a `trusted` segment (always `true`).

Sessions are built with `new EvoSDK(buildSdkOptions(...))`. For mainnet and
testnet the SDK takes its DAPI node list from the quorum service. Custom DAPI
endpoints are **not supported** on those networks: the documented equivalent is
a quorum-service URL override (Settings → Connection, or
`NEXT_PUBLIC_QUORUM_URL_MAINNET` / `_TESTNET`). Since evo-sdk 5.0, explicit
addresses take precedence over the service's list, so a custom devnet's saved
DAPI addresses are the endpoints it uses; quorum keys still come from its
quorum service.

### 6.3 What is not possible

- No list of all identities, contracts, tokens, cross-contract documents,
  addresses, blocks or transactions.
- No activity feed (no transaction index).
- No aggregate network statistics beyond total credits.
- No proof for `system.status`, `system.currentQuorumsInfo`,
  `stateTransitions.waitForStateTransitionResult`, `dpns.resolveName`,
  `dpns.isNameAvailable` or the local DPNS label checks. Quorum type and threshold are inferred by the SDK from member
  counts, and the UI labels them as inferred.
- No names for arbitrary contract IDs beyond the schema and the well-known
  registry (§14.4).
- `system.pathElements` is a batched point read (`KeysInPath`), not a subtree
  scan, so it cannot enumerate either
  ([research note](research/2026-04-22-path-query-and-token-lookup.md)).

### 6.4 SDK quirks the app works around

| Quirk | Handling |
|---|---|
| `sdk.version()` is the Platform protocol version the session speaks, auto-detected: on mainnet/testnet it starts at the network floor (13), rises after the first proved response, persists in localStorage and never steps down; devnets start at 14 and are not persisted. | /network/status warns when the network is newer than `EvoSDK.getLatestVersionNumber()` (14) or older than the session. Writes are blocked when session and network versions differ, using `metadata.protocolVersion` from a proved `totalCreditsInPlatform` read (#45). |
| The SDK caches up to 100 contracts per network in localStorage (`dash-sdk.contracts.<network>`). A type added later makes reads fail with "document type not found". | Document reads go through `withContractRefresh`: one `contracts.fetch` and one retry. Settings → Connection has "Clear SDK cache". |
| `PlatformAddressInput` / `Output` / `FeeStrategyStep` instances fail to deserialize in rc.8 ("missing field `address`"). | Address writes pass plain objects (#47). |
| A group config-update proposal that landed on chain can raise `DriveProofError: Expected document in group action result`. | The executor confirms by a proved read of the group's actions: complete pages, proved after the pre-signing read, exactly one new matching action by the signer. Otherwise "outcome unknown" (#48). |
| `TokenPriceInfo` exposes only the first and last tier of a tiered schedule (`basePrice`, `currentPrice`). | Prices are labelled by tier and shown per whole token (#43). |
| Document history and contract history return at most 10 entries per request; contract history has no offset. | Document history pages by `startAtMs`. A full contract history says older versions can't be shown. History is only queried for types/contracts that keep it, because the proof fails otherwise. |
| Shielded `encryptedNotes` starts must be multiples of 8192 (Drive needs multiples of 2048, the SDK verifier 4 × 2048). | Notes load on request, one 8192-note window at a time. |
| Evonode block counts by id/range return empty maps for past epochs. | The current epoch walks every page; past epochs use the finalized record's `blockProposers`. |
| `system.currentQuorumsInfo` is unproved and hard-codes `isVerified: true`. | The Verified column is not shown; type and threshold are marked inferred. |
| `documents.transfer` / `setPrice` / `purchase` send the document's revision as given, and Drive requires the stored revision + 1 ("invalid revision Some(1). The desired revision is 1"). | The executors bump the fetched document's revision before these writes (found in the live run). |
| `dpns.registerName` reports `fullDomainName` in the homograph-safe form (o → 0, i/l → 1), not the label as stored. | The receipt names the label as entered and adds the normalized form when it differs. |
| Reading `AssetLockProof.instantLockProof` on a chain-lock proof (or the reverse) traps the WASM module. | The asset-lock key check branches on `lockType` first. |
| Token configuration, `ResourceVote` and `GroupAction` JSON changed shape in 5.0 (internally tagged enums, `$kind`). | `enumVariant` and the readers accept both rc.2 and 5.0 shapes; unreadable rules show "unknown", not "on". |
| Error kinds were renumbered in 5.0 (`ExecutionNotProved` inserted at 6). | `src/sdk/errors.ts` keys its map by enum name, and a test checks it against the installed enum. |
| A gRPC NOT_FOUND from one node is an unproven answer. | Classified as retryable transport, not absence. Only structured SDK kinds (EpochNotFound, TotalCreditsNotFound, IdentityNonceNotFound) become `null`. |
| The SDK cannot abort an in-flight request, and `wasm.free()` on a busy instance crashes the request. | Cancellation is logical (results from retired sessions are discarded); retired sessions are dropped from the cache and freed by the FinalizationRegistry; only never-published instances are freed explicitly. |

---

## 7. Routes

All pages are client components under `src/app/`. Because the app is a static
export, entities are addressed with **query parameters, not `[param]`
segments**: `/identity/?id=…`, `/contract/document/?id=…&type=…&docId=…`. Every
link also carries `?network=` for the selected network. Detail routes opened
without their parameters show a short form and a link to their parent page.

### 7.1 Navigation

The sidebar (and mobile drawer) groups:

- **Browse:** Dashboard `/`, Search `/search/`, Saved items `/saved/`
- **Entities:** Identity, Contract, Tokens, DPNS (`/dpns/search/`), Evonodes
- **Network:** Status, Quorums, Epoch, Epoch history, Protocol, Credits, Shielded pool
- **Governance:** Contested, Polls, Groups
- **Write:** Broadcast, Wallet
- **Tools:** Query, Tools, SDK ref, Settings, About

Only the most specific matching item is marked current. The header holds the
global search (with a format hint after 200 ms), the network selector, a
share-link button and the theme toggle. A meter bar shows the block, epoch,
proof state, quorum count and network health (Platform progress compared with
the Core height from Insight). The footer shows the app and
SDK versions and the Query Inspector button.

### 7.2 Route map

| Route | Page |
|---|---|
| `/` | Dashboard (§9) |
| `/search/?q=` | Search results (§8) |
| `/saved/` | Saved identities, contracts and tokens (local, per network) |
| `/identity/?id=` | Identity (§10.1) |
| `/identity/lookup/?pkh=` | Identity by public-key hash |
| `/contract/?id=` | Data contract (§10.3) |
| `/contract/documents/?id=&type=` | Documents browser for one type |
| `/contract/document/?id=&type=&docId=` | Single document |
| `/contract/token/?id=&position=` | Token by contract + position |
| `/token/?id=` | Token by token ID (no ID: list of well-known tokens) |
| `/token/holders/?id=` | Seeded holder balances |
| `/address/?addr=` | Platform address (bech32m) |
| `/dpns/?name=` | DPNS name |
| `/dpns/search/?q=&after=` | DPNS prefix search |
| `/epoch/` | Current epoch |
| `/epoch/detail/?index=` | One epoch |
| `/epoch/history/?from=&to=` | Epoch range (≤ 200) |
| `/evonode/?proTxHash=` | Evonode (hex or base58) |
| `/network/status/` | Platform and Core status, quorums, protocol notice |
| `/network/quorums/` | Current quorums |
| `/network/protocol/` | Protocol version and vote tally |
| `/network/credits/` | Total credits, prefunded specialized balance lookup |
| `/network/shielded/` | Shielded pool |
| `/governance/contested/` | Contested resources for a contract / type / index |
| `/governance/contested/detail/?contract=&docType=&indexName=&indexValues=` | One contested resource, contenders and voters |
| `/governance/polls/?window=&page=` | Vote polls by end date |
| `/groups/?contractId=` | Groups in a contract |
| `/groups/detail/?contractId=&position=` | One group: members, actions, signers |
| `/state-transition/?hash=` | State-transition result by hash |
| `/query/` | SQL query workspace (§11.1) |
| `/tools/?tool=` | Deserializers and path-elements tool (§11.3) |
| `/sdk-reference/` | Generated page→SDK-call mapping |
| `/broadcast/?op=` | Write console (§13) |
| `/wallet/` | Signer setup (§13.2) |
| `/settings/` | Network, connection, devnets, proofs, inspector, diagnostics, registry, build info |
| `/about/` | Proof model, enumeration limits, write mode, privacy |

Pages set a tab title such as `alice.dash — Native Platform Explorer`. Entity
pages keep their selected tab in `?tab=`.

---

## 8. Search

`classifyQuery` (`src/util/search.ts`) collects every plausible reading of the
input, and `/search` tries them together:

| Input | Candidates |
|---|---|
| Integer below 1,000,000 | Epoch (`/epoch/detail`) |
| Base58 32-byte identifier | Identity (`identities.fetch`), contract (`contracts.fetch`), token (`tokens.totalSupply`) |
| 64-char hex | State-transition hash, evonode proTxHash (format-only links) |
| bech32m `dash1…` / `tdash1…` | Platform address (`addresses.get`) |
| 40-char hex public-key hash | `identities.byPublicKeyHash`, then `byNonUniquePublicKeyHash` |
| DPNS-shaped name | `dpns.getUsernameByName`; for a label of 2+ characters, up to 10 prefix matches via `documents.query` on the DPNS `domain` type |

Invalid input, not found and unavailable are separate states. Only completed
lookups can report "not found"; failed ones keep a Retry. Format-only
destinations (epoch, transaction hash) are labelled as lookups, without
claiming the entity exists. Prefix results whose homograph-safe label doesn't
match the prefix are hidden, with a count.

---

## 9. Dashboard (`/`)

A snapshot of live, verifiable state. No historical charts.

1. **Intro**: title, short explanation, proof legend.
2. **Network cards**: block height (`system.status`), current epoch with a
   progress bar (end estimated from the network's epoch length), total credits
   (DASH with USD, exact value in a tooltip), protocol version (from the current
   epoch record, with "N votes for vX" from the vote walk), active quorums.
3. **Top proposers**: top 10 for the current epoch, ranked from a full walk of
   `epoch.evonodesProposedBlocksByRange` with totals over every proposer and a
   "may be incomplete" flag if the page cap is hit.
4. **Quick actions**: identity, DPNS name, token, epoch.
5. **Quorums by size** (type and threshold marked inferred).
6. **Vote polls ending soon** (`voting.votePollsByEndDate`).
7. **Well-known contracts** for the network, with document-type count and owner
   loaded through one `contracts.getMany` when idle or hovered (per-ID fallback
   if the batch fails).

---

## 10. Entity pages

Most SDK reads go through a hook that calls the `…WithProof` variant where one
exists, so the card's proof chip and the Query Inspector have the proof.
Paginated walks (proposers, protocol votes, epoch-range batches),
and `contracts.getMany` previews call the plain method, which the trusted SDK
still verifies internally, but no proof bytes are captured (§12.4).

### 10.1 Identity — `/identity/?id=`

Header: identicon, DPNS name, balance (credits, DASH, USD), revision, nonce,
save/share, a Top up shortcut, and transfer, withdraw, update keys and register
name shortcuts when the connected (or remembered) signer is this identity.

Tabs: **Keys** (`identities.getKeys`), **DPNS** (names from `dpns.usernames`,
marked registered; a "contested name" pill from the local
`dpns.isContestedUsername` label rule), **Tokens** (well-known tokens for the
network plus entered IDs: `tokens.identityBalances`, frozen flag from
`identityTokenInfos`), **Groups** (`group.identityGroups`), **Votes**
(`voting.contestedResourceIdentityVotes`, linked to contest pages),
**Advanced** (contract nonce and `identities.contractKeys` for an entered
contract; keys bound to a single document type are not returned by that query).

### 10.2 Reverse lookup — `/identity/lookup/?pkh=`

`identities.byPublicKeyHash`, then `byNonUniquePublicKeyHash` if the unique
lookup succeeds empty. An invalid hash in the URL is flagged.

### 10.3 Data contract — `/contract/?id=`

Header: name from the registry, owner, version, counts. Tabs:

1. **Schema**: tree of document types (properties, required, indices) beside
   the JSON; selecting a node narrows the JSON.
2. **Document types**: links to the documents browser.
3. **Tokens**: per-position total supply, status (one `tokens.statuses` call),
   price (one `tokens.directPurchasePrices` call).
4. **Groups**: position, members and power, required power
   (`group.groupsDataContracts`), linking to `/groups/detail`.
5. **History**: `contracts.getHistory` timeline with JSON diffs, only when
   `config.keepsHistory` is set (newest 10 versions).
6. **Internal**: format and config versions, flags, bound-key requirements,
   keywords, description, raw JSON.

A "Create a document" shortcut is always shown; "Update contract" only to the
owner.

### 10.4 Documents browser — `/contract/documents/?id=&type=`

`documents.query` with filter rows per indexed field (`==`, `<`, `<=`, `>`,
`>=`, `in`, `startsWith`, booleans as a select), one ORDER BY over indexed
fields, page size, and a `startAfter` cursor stack. Filters, order, size and
cursors live in the URL. The query is checked against the type's indices
using the network's protocol version (§11.1); findings are warnings and the
query still runs. Changing filters or order clears the cursors.

### 10.5 Single document — `/contract/document/?id=&type=&docId=`

`documents.get`. Tabs: **Data**, **Metadata**, **Revision history**
(`documents.history`, 10 per page, diffed across pages; only for types that keep
history). Owners get edit / transfer / set price / delete shortcuts; a purchase
shortcut is always shown.

### 10.6 Token — `/token/?id=` and `/contract/token/?id=&position=`

`tokens.contractInfo(tokenId)` resolves the contract and position from the
token ID alone. Tabs:

1. **Overview**: supply (total, base, max, scaled by decimals), perpetual
   distribution, pre-programmed schedule, new-tokens destination, emergency
   and main-group control, the change-control table, trade mode, kept history.
2. **Definition**: owning contract, localizations, description.
3. **Status**: trading status (no status record means active) and the
   direct-purchase price by tier.
4. **Holders**: points to `/token/holders`. Platform has no holder index, so
   holders are a **seeded list**: pasted identity IDs or DPNS names, plus
   identities viewed in this browser if the user opted in
   (`tokens.balancesWithProof([ids], tokenId)`, with a proof chip and Query
   Inspector entry).
5. **Balance lookup**: balance, frozen flag and last perpetual claim for an
   entered identity (`?holder=`). Without one it shows the identity last
   connected on `/wallet` in this tab (the public reconnect hint).

An **Actions** row offers the token writes the connected or remembered
identity could plausibly perform under the token's rules (§13.3).

### 10.7 Platform address — `/address/?addr=`

`addresses.get`: balance and nonce. The input is checked as bech32m for the
selected network.

### 10.8 DPNS — `/dpns/?name=` and `/dpns/search/?q=`

`/dpns`: `dpns.resolveName`, `dpns.getUsernameByName`, `isNameAvailable`,
`isValidUsername`, `isContestedUsername`; links to the contest when one exists.

`/dpns/search`: `documents.query` on DPNS `domain`
(`normalizedParentDomainName == dash`, `normalizedLabel startsWith <folded prefix>`,
ascending, `startAfter` cursor in `?after=`). A name that only matches after
homograph folding says so ("matches as `a1rj0rdan8`"). With no prefix, a
directory of names is shown instead.

### 10.9 Epochs — `/epoch`, `/epoch/detail`, `/epoch/history`

- **Current** (`/epoch`): the current epoch is derived from signed response
  time with two proved reads
  ([current-epoch-integrity.md](current-epoch-integrity.md)); leaderboard
  ranked from the full proposer walk, with competition rank (1, 2, 2, 4);
  estimated end.
- **Detail**: `epochsInfo` and `finalizedInfos` for one index, queried
  independently ([finalized-epoch-details.md](finalized-epoch-details.md));
  finalized `blockProposers` take precedence over live counts; prev/next links.
- **History**: up to 200 epochs, fetched in sequential batches of 10
  ([design/epoch-sdk-queries.md](design/epoch-sdk-queries.md)).

### 10.10 Evonode — `/evonode/?proTxHash=`

Blocks, rank and share in the selected epoch (current plus the previous 24),
from the full walk for the current epoch and the finalized record for earlier
ones. Protocol vote from `versionUpgradeVoteStatus(hash, 1)`, accepted only if
the returned key equals this hash; the vote is the current epoch's.

### 10.11 Network pages

- **Status**: `system.status`, Core height from Insight, quorums table, the
  protocol-version notice (§6.4).
- **Quorums**: hash, type\*, members, threshold\* (\* inferred), raw response
  behind a disclosure.
- **Protocol**: current version from the current epoch record; every vote
  walked (`fetchAllProtocolVotes`) and tallied, with a "no vote yet" segment
  whose denominator is every voter plus every evonode that proposed in the
  previous finalized or current epoch; next version is the most-voted version
  above the current one. `protocol.versionUpgradeState` is shown only as a
  cross-check when it disagrees.
- **Credits**: `system.totalCreditsInPlatform`, and
  `system.prefundedSpecializedBalance` for an entered ID.
- **Shielded pool**: `poolState`, `mostRecentAnchor`, the full `anchors` set
  (paged locally), a nullifier lookup (hex or base64), and `encryptedNotes` in
  8192-note windows on request.

### 10.12 Governance and groups

- **Contested** (`group.contestedResources`): a contract with contested
  indexes (DPNS or another), document type and index, kept in the URL
  (`?contract&docType&index`). A contract with one contested index is selected
  automatically.
- **Contested detail**: `voting.contestedResourceVoteState` tally, and voters per
  contender from `group.contestedResourceVotersForIdentity` (50 per page).
  Tallies are weighted (evonodes 4, masternodes 1). Decided contests explain
  that Platform deletes individual votes. Open contests link to a prefilled
  vote form.
- **Polls** (`voting.votePollsByEndDate`): window (`?window=7d` or custom
  `from`/`to`), 20 per page, sortable by end time.
- **Groups** (`group.infos`) and **group detail** (`group.info`, `members`,
  `actions` active/closed, `actionSigners` with power against the required power).

### 10.13 State-transition lookup — `/state-transition/?hash=`

`stateTransitions.waitForStateTransitionResult(hash)`. The SDK blocks until the
transition executes, so the page shows elapsed seconds and gives up after
60 s with Retry. A retry races a new timer against the wait already in flight,
because the SDK cannot abort it. Result: status, error, reported hash, raw
response.

---

## 11. Developer tools

### 11.1 Query workspace — `/query`

A small SQL subset translated into `documents.query` and
`documents.count` / `sum` / `average` (via their `…WithProof` variants). It is
not a general SQL engine. Details: [design/query-workspace.md](design/query-workspace.md).

- `SELECT … FROM <type> WHERE … ORDER BY … LIMIT …`, `COUNT(*)`, `SUM`, `AVG`,
  `GROUP BY`; `LIKE 'abc%'` maps to `startsWith`; `!=`, `<>` and NOT are
  rejected with an explanation. Two-sided ranges in aggregates are sent as one
  `Between*` clause.
- Index checks follow Drive's rules for the network's protocol version, read
  from `system.status`: `Index::matches` up to protocol 13 and
  `matches_contiguous` from protocol 14. Until the version is known, the
  permissive rules apply. Checks are warnings; Platform is authoritative, and
  its common rejections get plain explanations.
- GROUP BY truncation notices follow Drive's modes (IN groups never flagged;
  range groups stop at LIMIT or 100; the two-range carrier walk at 10).
- Multiple statements per run, at most two executing at once, each with its own
  cursors. A full page triggers a one-document probe to decide whether Next is
  enabled.
- Saved queries (per network and contract, opt-in, local), share links
  (SQL, contract, network; the `trusted` flag older links carry is ignored),
  JSON/CSV export of the current page, generated SDK
  examples.

### 11.2 Query Inspector

A drawer opened from the footer or with ⌘/Ctrl+Shift+P. It records each SDK query with its
parameters, network, retrieval time, response height and protocol version when
returned, quorum-key source, proof bytes when captured, and the parsed proof
tree. The proof view handles both GroveDB proof layouts, PushInverted ops,
count/sum tree nodes, and marks malformed trees. Retention is bounded (200
entries, 8 MiB). Evidence can be exported as JSON; the file is unsigned and
records the observed SDK outcome only. Recording can be turned off in Settings.

### 11.3 Tools — `/tools`

Deserializers for a state transition, data contract, document, identity and
GroveDB proof (local WASM, no network except fetching a contract for document
decoding), and a `system.pathElements` reader.

### 11.4 SDK reference — `/sdk-reference`

The page→SDK-call mapping generated from TypeScript symbols by
`scripts/generate-sdk-reference.mjs` into `src/data/sdk-reference.json`. It
lists calls reachable through each route's components and hooks, including
conditional ones. It follows functions passed as shorthand properties
(`{ execute }`) and `const` aliases or destructuring of SDK facades
(`const tokens = sdk.tokens`); shared connection setup and methods on returned
SDK objects are out of scope. `pnpm build` fails on a stale mapping
(`pnpm generate:sdk-reference` updates it).

### 11.5 Saved items — `/saved`

Up to 100 identities, contracts and tokens, keyed by type, ID and network,
stored only in this browser, filterable by `?scope&kind`. Separate from the
opt-in viewed-identities log. See [exploration.md](exploration.md).

---

## 12. Design system

The original plan copied `platform-explorer`'s dark theme. The shipped "Field
Manual" design (PR #15) replaced it.

### 12.1 Colour modes

Light ("Paper") and dark ("Carbon") modes. The initial mode follows the OS
(`initialColorMode: 'system'`); the header toggle persists an explicit choice.
Components use semantic tokens (`bg`, `surface`, `raised`, `ink`, `muted`,
`hairline`, …) so they never branch on mode.

| Token | Value |
|---|---|
| Brand | `#3FB8E6` (light `#7DD4F2`, deep `#1A6DA5`) |
| Verified | `#6FCF97` |
| Trusted / pending | `#F2C94C` |
| Failed | `#EB5757` |
| Warning | `#F2A341` |
| Carbon bg / surface / ink | `#0A0A0C` / `#131316` / `#E8E6E1` |
| Paper bg / surface / ink | `#F4F1EA` / `#FFFFFF` / `#14110F` |

No violet or purple accents.

### 12.2 Typography

- **Fraunces** (variable serif): headings and key figures.
- **Geist**: body and UI.
- **JetBrains Mono**: identifiers, hashes, amounts, code.

Fraunces and JetBrains Mono are bundled from `src/styles/fonts/` with their
OFL licences; Geist comes from its npm package. Builds never fetch Google Fonts.

### 12.3 Layout and components

Breakpoints `30em / 48em / 62em / 80em / 96em / 120em`. Identifiers render in
mono with an identicon, copy button (labelled with what it copies) and wrapping
for long values. Tables have sortable headers with `aria-sort` where sorting is
offered. Loading uses skeletons and a sweep.

### 12.4 Proof state

Each proof-capable card carries a proof glyph with one of: verified,
in flight, no proof variant, unavailable (timeout, transport, missing quorum,
not found, …), failed (only explicit or unrecognised native proof errors), or
unknown. Opening it shows the inspector entry. A `ProofFailureBanner` appears on
failed cards; there is no "view unverified data" action, because there is no
unverified path. A missing quorum offers **Reconnect** (a new session with a
fresh quorum list) instead of Retry.

---

## 13. Write mode

Opt-in. The default experience is read-only. With
`NEXT_PUBLIC_DISABLE_WRITE_MODE=true`, `/broadcast` and `/wallet` show a
"write mode is disabled" notice instead of their consoles, and every link into
them is hidden: the sidebar Write group, owner and create shortcuts on
identity, contract and document pages, "Register a new contract", the token
Actions row and the contest vote link. `/sdk-reference` lists the two pages
without linking them.
Design notes: [design/transaction-workflow.md](design/transaction-workflow.md),
[design/signer-capabilities.md](design/signer-capabilities.md).

### 13.1 Flow

`/broadcast` lists operations by group. Each runs through `OperationShell`:

1. **Build**: typed form; amounts are exact (bigint credits or token base
   units); forms explain why an operation is unavailable before Review.
2. **Review**: a summary built from a frozen snapshot of the inputs, the key
   that will sign (ID, purpose, level, bounds), and how fees are charged (the
   SDK gives no fee estimate). Secrets are redacted: each operation must declare
   its secrets (`OperationDescriptor.secrets`), and Review shows only its
   `reviewData`.
3. **Sign + broadcast**: mainnet requires a checkbox and typing `MAINNET`;
   destructive operations require an acknowledgement. The reviewed key is
   pinned: if it is no longer eligible, the operation fails as not submitted.
4. **Result**: one of
   - **Not submitted**: anything before the SDK write call, or an SDK
     `InvalidArgument` (which, per an audit of every write function in
     `outcomes.test.ts`, is raised only before submission);
   - **Succeeded**: receipt with links to affected entities; network-scoped
     queries are invalidated;
   - **Outcome unknown**: any other error after submission started, including
     `ExecutionNotProved`. No Retry is offered; the user is asked to check the
     affected entities first, because a retry may spend twice.

Before building anything, `withSigningMaterial` runs the protocol-version guard
(§6.4). Signing material is released when the operation settles.

### 13.2 Signers

The `/wallet` page has four tabs:

| Signer | Notes |
|---|---|
| **Bridge backup** | Import the JSON backup from the identity bridge. Keys are matched against enabled on-chain keys; the backup's declared purpose/level is ignored. |
| **Mnemonic** | Derives DIP-13 identity keys `m/9'/coin'/5'/0'/0'/identityIndex'/keyIndex'` for key indexes 0–15 (the bridge's layout), keeps those that match enabled on-chain keys, wipes the rest. |
| **WIF** | One private key for an identity, matched against its on-chain keys. |
| **Extension** | **Detection only.** The Dash Platform Extension's public API is not stable, so signing through it is not implemented; the tab says so. |

Secrets are typed into `SecretInput`, a CSS-masked text field (not a password
field, so browsers don't offer to save a key), with fallbacks where masking is
unsupported. Local signers keep keys in tab memory only and clear them on
disconnect, after ten minutes without input (visible or hidden tab), when
leaving `/wallet` and `/broadcast`, and on unload. An automatic clear keeps only
the signer kind and public identity ID in sessionStorage as a reconnect hint.
JavaScript strings and SDK-internal copies cannot be reliably zeroed; the app
zeroes byte arrays it owns.

**Form-signed operations** (#47) take their keys in the form instead of from a
connected signer: Platform address keys, the one-time asset-lock key, a
masternode voting key, or no key for an already-signed transition. Those keys
are decoded, checked against the network, loaded into WASM, zeroed and freed
when the operation settles. Before an asset-lock create, top-up or fund is
submitted, the asset-lock key must control the locked credit output: the P2PKH
hash of that output (in the asset-lock payload) must equal the key's public key
hash, or the operation fails as not submitted. InstantSend proofs carry the
transaction; for chain-lock proofs it is fetched from the network's Insight
API and must hash to the proof's txid (a network without Insight needs an
InstantSend proof).

Key selection (`capabilities.ts`, `resolveSigningCriteria`): document operations
accept keys up to the type's `signatureSecurityLevelRequirement` (default HIGH)
and refuse MASTER-only types; contract register and DPNS accept CRITICAL or
HIGH; contract update CRITICAL; identity key updates MASTER; credit transfers
and identity→address funding CRITICAL TRANSFER; withdrawals CRITICAL TRANSFER,
or CRITICAL OWNER to a masternode payout address; token operations CRITICAL
AUTHENTICATION, plus CRITICAL TRANSFER for a single transfer or claim.
Contract-bound keys qualify only for their contract (and type).

### 13.3 Operations

| Group | Operations | SDK |
|---|---|---|
| Contracts | register, update (`version + 1`, keeps `$defs` unless edited) | `contracts.publish`, `contracts.update` |
| Documents | create, replace, delete, transfer, set price, purchase | `documents.*` |
| Tokens | mint, burn, transfer, freeze, unfreeze, destroy frozen, pause/resume, set price (single or tiered), direct purchase, claim (perpetual, pre-programmed, once-per-identity), config update; group propose and co-sign | `tokens.*` |
| Identity & credits | create and top up from an asset lock (form-signed), credit transfer, withdrawal, update keys (add with WIFs, disable) | `identities.create`, `topUp`, `creditTransfer`, `creditWithdrawal`, `update` |
| Platform addresses | send between addresses, fund from identity, top up identity, withdraw, fund from asset lock, create identity | `addresses.*` |
| DPNS | register name (contested names explained, 0.2 DASH contest fee) | `dpns.registerName` |
| Voting | masternode vote (voter ID = SHA-256(proTxHash ‖ hash160(voting key))) | `voting.masternodeVote` |
| Advanced | broadcast a signed transition (hex or base64, decoded and re-encoded locally; "already in mempool/chain" reported as already submitted) | `stateTransitions.broadcastStateTransition`, `waitForResponse` / `waitForAffectedState` |

Token forms mirror Drive's validation at v5.0.0-rc.8 (who the rules authorize,
group power, paused state, mint destination and max supply, frozen balances,
price and buyer credits, claim eligibility, config control rules); executors
reload a proved snapshot and re-run every check immediately before signing,
then wait for a proof newer than that snapshot to show the change. Config
updates that give up control are treated as destructive.

Without a Core wallet, identity creation and top-up go through the bridge
(`NEXT_PUBLIC_BRIDGE_URL`, default `https://bridge.dashhq.org`, mainnet and
testnet); the shortcut passes the network only. The explorer does not build
asset-lock transactions.

### 13.4 Test status

Run end to end on testnet through the served export, with proved read-back:

- every Platform-address operation, asset-lock identity create and top-up, and
  raw broadcast (#47);
- mint, burn, transfer, freeze, unfreeze, destroy frozen, pause/resume, single
  and tiered set price, direct purchase, perpetual claim, config updates, and
  group propose/co-sign of max-supply changes (#48);
- contract register (with `$defs`) and update (version 1 → 2, `$defs` kept);
  document create, replace, delete, transfer, set price and purchase; identity
  credit transfer, withdrawal to a Core address, adding a key with its private
  key and disabling a key; DPNS registration of a non-contested name
  (`fix/discrepancies-l`). Document transfer failed on the first run (revision
  not bumped) and passed after the fix; set price and purchase ran only with
  the fix. A contested-length label was built to Review to check its notice
  but not submitted.

The asset-lock key check was run live only on its refusal path (a consumed
chain-lock proof with the wrong key: not submitted). Registering a contract
and updating it each cost about 0.12 tDASH on testnet.

Not yet broadcast live (unit- and real-WASM-tested):

- **masternode votes**: no voting key is available;
- contested DPNS registrations (0.2 DASH contest fee);
- pre-programmed and once-per-identity token claims, and group co-signing of
  token actions other than config updates;
- **anything on mainnet**.

---

## 14. Cross-cutting concerns

### 14.1 SDK sessions

`SdkProvider` owns one session per (network, reconnect) with a unique session ID
and abort signal. Details: [design/query-session-lifecycle.md](design/query-session-lifecycle.md).

- `connect()` has an explorer deadline (startup timeout, default 20 s).
  Failures carry a reason (timeout, unreachable, unknown network, failed);
  queries report it instead of spinning, and a page-level "Cannot reach Dash
  Platform" notice links to Settings → Connection.
- Changing network or reconnecting retires the old session: its queries are
  removed from the cache and their late results discarded. Paginated walks
  check the session before and after each page.
- Classification (`classifySdkError`) separates absence, timeout, transport,
  missing quorum and verification failure. The global retry runs once, only for
  timeouts, transport and unknown errors.

### 14.2 Networks and connection settings

Built-in networks: **testnet** (default), **mainnet** and **devnet-paloma**
(whose quorum service no longer resolved in DNS when last checked in #45). Custom devnets can be added in
Settings with a name, a quorum-service URL (required unless derivable as
`quorums.<name>.networks.dash.org`), and optional DAPI addresses, Insight API
and faucet URLs; they are stored
locally and selectable with `?network=`.

Settings → Connection (localStorage): startup timeout; SDK connect timeout,
request timeout, retries, `banFailedAddress` and log level; mainnet/testnet
quorum-service overrides (`https://`, or `http://` for localhost); and
"Clear SDK cache", which removes the SDK's persisted contracts and protocol
version for the network and reconnects.

### 14.3 Data fetching and caching

TanStack Query wraps every SDK call. Keys are
`['npe', network, trusted, sessionId, …]`. Defaults: `staleTime` 30 s and
`gcTime` 24 h; hooks use 30 s for live data, 5 min for structural data
(contracts, identity keys) and `Infinity` for deterministic results and
finalized epochs. Documents fetched by ID refresh after 30 s, and Platform
status polls every 30 s. Confirmed writes invalidate every query for their
network. The React Query cache is not persisted. Hovering or focusing a link
for 150 ms prefetches the destination's primary query (max 4 at once, not on
touch).

### 14.4 Well-known registry

`src/constants/well-known.ts` holds network-scoped entries: the system contracts
(DPNS, Withdrawals, Dashpay, Masternode reward shares, Feature flags, Wallet
utils, Keyword search, Token history); on mainnet DUSD and SANS, their
contracts, their owner identity and latte.dash; on testnet tDUSD, tSANS, their
contracts and atlanta-degen-for-life.dash. They name entities, seed the
identity Tokens tab and holders form, and populate the token and contract
landings.

`NEXT_PUBLIC_WELL_KNOWN_URL` adds a remote JSON document at runtime
(`{ "version": 1, "entries": [...] }`, absolute or relative to the app root;
strict validation, ≤ 500 entries, ≤ 256 KiB, https entry URLs, no credentials,
10 s timeout; one bad entry rejects the file). Settings → Well-known registry adds local entries. On a duplicate ID,
bundled wins over remote, and remote over local.

### 14.5 URL state

nuqs keeps filters, cursors, ranges, tabs and windows in the URL (documents
browser, DPNS search, epoch history, polls, saved items, contested resources,
entity tabs). Updates keep `?network=` and the base path; list views (documents, DPNS search,
epoch history, polls, contested selection) push history entries, while tabs,
saved-item filters and `?holder` replace the current one. Invalid values fall
back to defaults, and one bad cursor drops the
whole cursor stack.

### 14.6 DPNS everywhere

Where an identity ID appears, `dpns.username` is looked up and shown beside it.
Failures are silent.

### 14.7 DASH/USD rate

Fetched from the browser. Default provider **Coinbase**;
`NEXT_PUBLIC_RATE_PROVIDER=kucoin` tries KuCoin first (it sends no CORS headers,
so it only works behind a proxy) and falls back to Coinbase; `none` disables it.
Cached for 60 s. The UI degrades to credits/DASH when the rate is missing.

### 14.8 Accessibility

Chakra semantics, keyboard-navigable controls, labelled copy buttons and
identifiers, `aria-sort` on sortable headers, and `prefers-reduced-motion`
honoured (no loading sweep or skeleton pulse, instant transitions, Framer
Motion `reducedMotion="user"`).

### 14.9 Internationalization

English only. The planned `t(key)` helper was **deferred**: strings are plain
literals. DPNS uses its own homograph folding.

### 14.10 Privacy and local storage

No analytics or telemetry. Besides DAPI, the browser contacts:

- the quorum service for the selected network (or its override);
- the network's Insight API (`insight.dash.org`, `insight.testnet.networks.dash.org`, or a custom devnet's own Insight URL) for the Core height in the health meter and on /network/status;
- Coinbase (or KuCoin, if selected) for the DASH/USD rate, unless disabled;
- `NEXT_PUBLIC_WELL_KNOWN_URL`, if configured;
- the bridge, only when the user follows a bridge link.

The explorer stores in localStorage: the selected network, connection
settings, custom devnets, colour mode, saved items, saved queries, local
registry entries, recent contracts in the broadcast picker, the Query Inspector
and diagnostics preferences, some dismissed notices, and (opt-in) viewed
identities.
The SDK itself stores up to 100 fetched contracts and the detected protocol
version per mainnet/testnet. All of these are public data or preferences.
sessionStorage holds the signer reconnect hint (kind and public identity ID)
and the protocol-notice dismissal.
Private keys and mnemonics are never stored.

### 14.11 Security

- No key custody (§13.2).
- Owner-gated shortcuts and capability checks are conveniences; the shell
  re-checks keys and context before every write.
- **Hardening in progress (I1, `chore/hardening`, not merged):** a service
  worker / offline shell, a meta Content-Security-Policy, an `integrity.json`
  with SRI hashes, a `Cargo.lock` for the vendored proof parser, and dependency
  cleanup. None of these ship today; the site has no CSP and no SRI.

---

## 15. Non-functional requirements

### 15.1 Performance

- **Bundle budgets, enforced in CI** (`pnpm check:bundles`): the dashboard,
  `/identity`, `/query`, `/wallet` and `/broadcast` routes each stay under
  **512 KiB gzip and 2 MiB raw** of initial JavaScript, measured from the
  exported HTML. As of #48, `/broadcast` is the largest at about 485 KiB gzip.
- The SDK (about 9.1 MB gzip in the export with 5.0.0-rc.8) and the proof-parser
  WASM load on demand, so the shell paints without them.
- User Timing marks: `npe:app-shell`, `npe:sdk:module-load`,
  `npe:sdk:construct`, `npe:sdk:connect`. See [performance.md](performance.md).
- A proof-parsing worker is deferred until profiling shows blocking.

### 15.2 Browser support

Chrome / Edge / Firefox 111+ and Safari 16.4+ (the Next.js 16 baseline). WASM
is required. CI tests Chromium only.

### 15.3 Offline and resilience

- No service worker today (in progress in I1). Offline, the shell fails to load
  like any static site.
- When DAPI or the quorum service is unreachable, pages render with a
  "Cannot reach Dash Platform" notice; Settings, saved items, tools and the
  query editor still work.
- `banFailedAddress` and retries are configurable (§14.2).

### 15.4 Observability

A diagnostics drawer (`⌘/` or `Ctrl+/`) shows client log entries; it can be
turned off in Settings. Nothing is sent to external telemetry. The SDK log
level is a connection setting.

### 15.5 Versioning

The SDK is pinned to an exact version. An SDK bump is its own PR, with the
error-kind map test and the pre-submission audit in `outcomes.test.ts` forcing a
review of runtime behaviour.

---

## 16. Build, CI and deployment

### 16.1 Commands

```sh
pnpm install --frozen-lockfile
pnpm dev                       # next dev --webpack
pnpm lint && pnpm typecheck
pnpm test                      # vitest (test:coverage in CI)
NEXT_PUBLIC_BRIDGE_URL=https://bridge.dashhq.org pnpm build   # check:sdk-reference, then next build → out/
pnpm check:bundles             # route JavaScript budgets
pnpm exec playwright install chromium   # once, before e2e
pnpm e2e                       # Playwright against the export
pnpm generate:sdk-reference    # refresh src/data/sdk-reference.json
```

### 16.2 CI (`.github/workflows`)

- **`ci.yml`** (pull requests and `main`, runner `ubuntu-24.04`): frozen
  install, lint, typecheck, `test:coverage`, `test:bundles`,
  `test:sdk-reference`, build at the Pages deployment prefix,
  `check:bundles`, Playwright Chromium e2e against that exact export, then
  uploads it as `validated-pages`. The e2e suite runs offline against recorded
  quorum-service fixtures; it never broadcasts.
- **`deploy.yml`**: after a successful CI run on `main` (push or manual dispatch), deploys that
  exact artifact to GitHub Pages if it is still the head of `main`. No rebuild.
- **`live-integration.yml`**: daily and on demand, read-only live SDK checks
  (`scripts/live-integration.mjs`) against testnet or a chosen network.

### 16.3 Deployment targets

**GitHub Pages only**, currently at the custom domain
<https://explorer.dashhq.org> (root prefix). Project-prefix hosting is supported
with `NEXT_PUBLIC_BASE_PATH`. Vercel, Netlify and IPFS/Arweave targets from the
original PRD were **not pursued**.

### 16.4 Environment variables (all public, build time)

| Variable | Purpose | Default |
|---|---|---|
| `NEXT_PUBLIC_DEFAULT_NETWORK` | Initial network (`mainnet`, `testnet` or a devnet name) | `testnet` |
| `NEXT_PUBLIC_QUORUM_URL_MAINNET` | Quorum service for mainnet (`https://`, or `http://` for localhost; invalid values ignored with a warning) | `https://quorums.mainnet.networks.dash.org` (SDK default) |
| `NEXT_PUBLIC_QUORUM_URL_TESTNET` | Same for testnet | `https://quorums.testnet.networks.dash.org` (SDK default) |
| `NEXT_PUBLIC_DISABLE_WRITE_MODE` | `true` replaces `/broadcast` and `/wallet` with a disabled notice | `false` |
| `NEXT_PUBLIC_RATE_PROVIDER` | `coinbase`, `kucoin` or `none` | `coinbase` |
| `NEXT_PUBLIC_WELL_KNOWN_URL` | Remote well-known registry JSON | unset |
| `NEXT_PUBLIC_BRIDGE_URL` | Bridge base URL (HTTPS, no query or fragment) for identity create/top-up shortcuts; empty disables them | `https://bridge.dashhq.org` |
| `NEXT_PUBLIC_BASE_PATH` | Deployment path prefix for project Pages sites | empty (root) |

Not supported: `NEXT_PUBLIC_TRUSTED_MODE` (removed, §6.2) and
`NEXT_PUBLIC_DAPI_ADDRESSES_*` (mainnet/testnet use the quorum service's node
list). `NEXT_PUBLIC_EVO_SDK_VERSION` is set by `next.config.mjs`, not by users.

---

## 17. Feature matrix

| Feature | Status | SDK calls |
|---|---|---|
| Dashboard: height, epoch, credits, protocol, quorums, proposers, polls | ✓ | `system.status`, `epoch.epochsInfo`, `system.totalCreditsInPlatform`, `protocol.versionUpgradeVoteStatus`, `system.currentQuorumsInfo`, `epoch.evonodesProposedBlocksByRange`, `voting.votePollsByEndDate`, `contracts.getMany` |
| Search (ID, name, prefix, address, pk hash, hash, epoch) | ✓ | see §8 |
| Identity, keys, nonces, DPNS, tokens, groups, votes, contract keys | ✓ | `identities.*`, `dpns.usernames`, `tokens.identityBalances` / `identityTokenInfos`, `group.identityGroups`, `voting.contestedResourceIdentityVotes` |
| Reverse lookup by public-key hash | ✓ | `identities.byPublicKeyHash` / `byNonUniquePublicKeyHash` |
| Contract schema, types, tokens, groups, internal config | ✓ | `contracts.fetch`, `tokens.*`, `group.groupsDataContracts` |
| Contract history | Partial (keepsHistory only, newest 10) | `contracts.getHistory` |
| Documents browser with filters and cursors | ✓ | `documents.query` |
| Single document and revision history | ✓ (history only when kept) | `documents.get`, `documents.history` |
| SQL query workspace with aggregates | ✓ | `documents.query`, `count`, `sum`, `average` |
| Token detail, rules, distributions, prices, balance lookup | ✓ (tiered price: first/last tier) | `tokens.*` |
| Token holders | Seeded list only | `tokens.balances` |
| Platform address | ✓ | `addresses.get` |
| DPNS resolve, availability, contest, prefix search | ✓ | `dpns.*`, `documents.query` |
| Current, historical and finalized epochs | ✓ | `epoch.epochsInfo`, `finalizedInfos`, `evonodesProposedBlocksByRange` |
| Evonode blocks, rank and vote | ✓ | `epoch.evonodesProposedBlocksByIds` / `ByRange`, `protocol.versionUpgradeVoteStatus` |
| Protocol version and full vote tally | ✓ | `protocol.versionUpgradeVoteStatus`, `epoch.*` |
| Quorums | ✓ (unproved, type/threshold inferred) | `system.currentQuorumsInfo` |
| Shielded pool | ✓ | `shielded.*` |
| Contested resources, tallies, voters; vote polls | ✓ | `group.contestedResources`, `voting.contestedResourceVoteState`, `group.contestedResourceVotersForIdentity`, `voting.votePollsByEndDate` |
| Groups, members, actions, signers | ✓ | `group.*` |
| Prefunded specialized balance | ✓ | `system.prefundedSpecializedBalance` |
| State-transition result | ✓ (no proof) | `stateTransitions.waitForStateTransitionResult` |
| Proof chips, failure banner, Query Inspector, evidence export | ✓ | `…WithProof` variants |
| Deserializers and path elements | ✓ | WASM classes, `system.pathElements` |
| Write mode (§13.3) | ✓ (live-tested on testnet except masternode votes, contested DPNS and some token claims; see §13.4) | write facades |
| Extension signer | Detection only | — |
| Custom DAPI endpoints (mainnet/testnet) | ✗ — quorum-service override instead | — |
| Untrusted mode | ✗ — removed | — |
| Service worker, CSP, SRI | In progress (I1) | — |
| Global lists, time series, aggregate statistics | ✗ | not SDK primitives |

---

## 18. Known limitations

| Limitation | Cause | Mitigation |
|---|---|---|
| No latest blocks / transactions feed | SDK cannot list them | Dashboard shows epoch, proposer and governance data |
| No list of all identities / contracts / tokens | No enumeration primitive | Search, well-known registry, saved items, per-contract lists |
| Token holders only as complete as the seed list | `tokens.balances` takes identity IDs | Clear labelling; opt-in viewed-identities seed |
| Status, quorums, transition results, DPNS resolve/availability unproved | No proof variants | Labelled "No proof"; quorum fields labelled inferred |
| History caps (10) and no contract-history offset | Drive / SDK limits | Pages where possible; says when older entries can't be shown |
| Protocol "no vote yet" denominator is an estimate | Platform exposes no masternode list | Denominator stated: voters plus recent proposers |
| Version mismatches block writes | Session protocol version only ratchets up | Notice on /network/status; Clear SDK cache |
| Some writes not broadcast live (masternode votes, contested DPNS, some token claims, all of mainnet) | No voting key; contest fee; no funded mainnet run | Unit and real-WASM tests; see §13.4 |
| Chain-lock asset-lock proofs need Insight for the key check | The proof has no transaction | Networks without an Insight API need an InstantSend proof |
| Extension signer unusable | Extension API not stable | Detection-only tab; bridge backup, mnemonic or WIF |
| No i18n | Deferred | English strings only |
| Single ORDER BY in the documents browser | UI scope | Warning when a range and an `in` filter both need ordering |
| Large SDK download (~9 MB gzip) | SDK size | Loaded lazily; shell works meanwhile |
| devnet-paloma unreachable | Its quorum service doesn't resolve | Custom devnets |
| Contract schema typos reach Drive | The WASM build's `fullValidation` does not run the document meta-schema (e.g. `documentsTransferable` for `transferable` passed locally) | Drive rejects at check_tx; the receipt says "outcome unknown" because a broadcast that reached Platform is never presumed rejected |

---

## 19. Open questions

1. **Crowd-sourced registry.** Remote loading exists (`NEXT_PUBLIC_WELL_KNOWN_URL`).
   Should production point at a reviewed, signed registry in a separate repo?
2. **Extension signing.** Adopt the Dash Platform Extension once its signing API
   is stable?
3. **Masternode voting acceptance.** A live vote with a real voting key before
   calling it tested.
4. **Unused 5.0 facades.** Which of `contractGroups`, `encryptedFor`,
   moderation, ranked/composite document queries and key-limit updates are worth
   surfacing?
5. **Embeddable widgets** (e.g. an identity card): deferred.

---

## 20. Appendix: SDK-call index

Abridged from `src/data/sdk-reference.json` (SDK 5.0.0-rc.8). Each read is
called through both the plain method and its `…WithProof` variant unless marked
¹ (plain only: methods without a proof variant, paginated walks and batches,
or reads inside write flows). Omitted for brevity: `dpns.isContestedUsername`¹
(a local label rule, on every page that shows identities) and
`ensureInitialized` (WASM setup on `/tools`).

| Route | SDK calls |
|---|---|
| `/` | `contracts.getMany`¹, `epoch.epochsInfo`, `epoch.evonodesProposedBlocksByRange`¹, `protocol.versionUpgradeVoteStatus`¹, `system.currentQuorumsInfo`¹, `system.status`¹, `system.totalCreditsInPlatform`, `voting.votePollsByEndDate` |
| `/search/` | `addresses.get`, `contracts.fetch`, `documents.query`, `dpns.getUsernameByName`, `dpns.username`, `identities.byNonUniquePublicKeyHash`, `identities.byPublicKeyHash`, `identities.fetch`, `tokens.totalSupply` |
| `/identity/` | `contracts.fetch`¹, `documents.query`, `dpns.username`, `dpns.usernames`, `group.identityGroups`, `identities.balanceAndRevision`, `identities.contractKeys`, `identities.contractNonce`, `identities.fetch`, `identities.getKeys`, `identities.nonce`, `tokens.identityBalances`, `tokens.identityTokenInfos`, `voting.contestedResourceIdentityVotes` |
| `/identity/lookup/` | `identities.byNonUniquePublicKeyHash`, `identities.byPublicKeyHash`, `dpns.username` |
| `/contract/` | `contracts.fetch`, `contracts.getHistory`, `dpns.username`, `group.groupsDataContracts`, `tokens.calculateId`¹, `tokens.directPurchasePrices`, `tokens.statuses`, `tokens.totalSupply` |
| `/contract/documents/` | `contracts.fetch`, `documents.query`, `dpns.username`, `system.status`¹ |
| `/contract/document/` | `contracts.fetch`, `documents.get`, `documents.history`, `dpns.username` |
| `/contract/token/`, `/token/` | `contracts.fetch`, `tokens.calculateId`¹ (contract route), `documents.query` (token route), `dpns.username`, `tokens.contractInfo`, `tokens.directPurchasePrices`, `tokens.identityBalances`, `tokens.identityTokenInfos`, `tokens.perpetualDistributionLastClaim`, `tokens.statuses`, `tokens.totalSupply` |
| `/token/holders/` | `dpns.resolveName`¹, `dpns.username`, `tokens.balances` / `balancesWithProof` |
| `/address/` | `addresses.get` |
| `/dpns/` | `dpns.getUsernameByName`, `dpns.isNameAvailable`¹, `dpns.isValidUsername`¹, `dpns.resolveName`¹, `dpns.username` |
| `/dpns/search/` | `contracts.fetch`¹, `documents.query`, `dpns.username` |
| `/epoch/` | `epoch.epochsInfo`, `epoch.evonodesProposedBlocksByRange`¹ |
| `/epoch/detail/` | `epoch.epochsInfo`, `epoch.evonodesProposedBlocksByRange`¹, `epoch.finalizedInfos` |
| `/epoch/history/` | `epoch.epochsInfo` |
| `/evonode/` | `epoch.epochsInfo`, `epoch.evonodesProposedBlocksByIds`, `epoch.evonodesProposedBlocksByRange`¹, `epoch.finalizedInfos`, `protocol.versionUpgradeVoteStatus` |
| `/network/status/` | `system.currentQuorumsInfo`¹, `system.status`¹, `version`¹, `EvoSDK.getLatestVersionNumber` |
| `/network/quorums/` | `system.currentQuorumsInfo`¹ |
| `/network/protocol/` | `epoch.epochsInfo`, `epoch.evonodesProposedBlocksByRange`¹, `epoch.finalizedInfos`, `protocol.versionUpgradeState`, `protocol.versionUpgradeVoteStatus`¹ |
| `/network/credits/` | `system.prefundedSpecializedBalance`, `system.totalCreditsInPlatform` |
| `/network/shielded/` | `shielded.anchors`, `shielded.encryptedNotes`, `shielded.mostRecentAnchor`, `shielded.nullifiers`, `shielded.poolState` |
| `/governance/contested/` | `contracts.fetch`, `group.contestedResources` |
| `/governance/contested/detail/` | `dpns.username`, `group.contestedResourceVotersForIdentity`, `voting.contestedResourceVoteState`, `voting.votePollsByEndDate` |
| `/governance/polls/` | `voting.votePollsByEndDate` |
| `/groups/` | `group.infos` |
| `/groups/detail/` | `dpns.username`, `group.actionSigners`, `group.actions`, `group.info`, `group.members` |
| `/state-transition/` | `stateTransitions.waitForStateTransitionResult`¹ |
| `/query/` | `contracts.fetch`, `documents.query`, `documents.count`, `documents.sum`, `documents.average`, `dpns.username`, `system.status`¹ |
| `/tools/` | `contracts.fetch`, `system.pathElements`; WASM `DataContract`, `Document`, `Identity`, `StateTransition` `.fromBytes`, `PlatformVersion.latest` |
| `/settings/` | `system.status`¹, `version`¹, `EvoSDK.getLatestVersionNumber` |
| `/wallet/` | `identities.fetch`¹, `dpns.username`; `wallet.deriveKeyFromSeedWithPath`, `wallet.keyPairFromWif`, `wallet.validateMnemonic`, `PrivateKey.fromBytes` |
| `/broadcast/` | **Writes:** `contracts.publish`, `contracts.update`, `documents.create` / `replace` / `delete` / `transfer` / `setPrice` / `purchase`, `identities.create` / `topUp` / `creditTransfer` / `creditWithdrawal` / `update`, `addresses.transfer` / `transferFromIdentity` / `topUpIdentity` / `withdraw` / `fundFromAssetLock` / `createIdentity`, `dpns.registerName`, `voting.masternodeVote`, `stateTransitions.broadcastStateTransition` / `waitForResponse` / `waitForAffectedState`, and the token writes `tokens.mint` / `burn` / `transfer` / `freeze` / `unfreeze` / `destroyFrozen` / `emergencyAction` / `setPrice` / `directPurchase` / `claim` / `configUpdate`. **Reads:** `addresses.get`, `contracts.fetch`, `documents.get`, `dpns.username`, `epoch.epochsInfo`, `group.actions`, `group.actionSigners`, `identities.balance` / `balances` / `byPublicKeyHash` / `fetch`, `system.totalCreditsInPlatformWithProof`, `tokens.balances` / `calculateId` / `contractInfo` / `directPurchasePrices` / `identitiesTokenInfos` / `statuses` / `totalSupplyWithProof`, `version`, `voting.contestedResourceVoteState`. **Utilities:** `AssetLockProof.*`, `CoreScript.fromP2PKH` / `fromP2SH`, `Identifier.*`, `PrivateKey.fromBytes`, `ResourceVoteChoice.*`, `StateTransition.fromBytes` / `fromHex`, `wallet.*` |
| `/about/`, `/saved/`, `/sdk-reference/` | none |

