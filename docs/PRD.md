# Native Platform Explorer — Product Requirements Document (PRD)

> A client-only Dash Platform (Evolution) block explorer, powered exclusively by `@dashevo/evo-sdk`.
> Styled and structured as a sibling of `pshenmic/platform-explorer` v2.3.0.

---

## 0. Executive Summary

**Native Platform Explorer** is a **zero-backend, zero-indexer, browser-native** block explorer for Dash Platform. Every piece of data it shows is fetched **live** by the `@dashevo/evo-sdk` (a TypeScript wrapper around the Rust/WASM Dash Platform SDK) running directly in the user's browser. There is no API server, no database, no scheduled indexer, and no custom infrastructure beyond static file hosting.

Compared to the reference `platform-explorer`, the scope is necessarily **reduced** — the SDK does not support global enumeration of identities, contracts, tokens, or documents. In exchange, the explorer gains:

- **Trust-minimised data** via the SDK's trusted-mode proof verification (GroveDB Merkle proofs verified in-browser against prefetched quorum keys).
- **Zero operational cost** — ship as a static site; infinite horizontal scale.
- **Always-current data** — no indexing lag, no stale views, no "syncing" state.
- **Optional write mode** — because the SDK can broadcast state transitions, every facade's write methods can be surfaced as optional, wallet-gated UI.

The explorer is designed to feel like a **native sibling** of `platform-explorer`: same dark-mode brand (`#008DE4`), same Montserrat/Open Sans/Roboto Mono typography, same card/tab/identifier conventions, same top-bar + network-selector + global-search layout.

**Package name (proposed):** `native-platform-explorer`
**Target platforms:** Desktop + mobile web. No native apps.
**License:** MIT (matching `evo-sdk`).

---

## 1. Goals & Non-Goals

### 1.1 Goals

1. Provide a fully-featured, SDK-only exploration UI for Dash Platform's on-chain state.
2. Match the look and feel of `platform-explorer` so the two products feel like a family.
3. Expose every read facade the SDK offers — if the SDK can query it, we can render it.
4. Expose every write facade the SDK offers, gated behind an opt-in wallet / signer flow.
5. Run entirely from static hosting (Vercel / Netlify / GitHub Pages / IPFS compatible).
6. Verify cryptographic proofs client-side wherever trusted mode is supported, and clearly indicate proof state in the UI.
7. Deep-linkable: every entity view is a URL that fetches everything it needs from the SDK on mount.

### 1.2 Non-Goals

1. **No global enumeration / ranking / trending pages.** The SDK cannot list all identities, contracts, tokens, or cross-contract documents. We do not fake this with custom indexing.
2. **No historical time-series charts** (tx/hour, tps over time, etc.) — requires an indexer.
3. **No aggregated statistics** (total tx count, "richest identities", etc.) — likewise.
4. **No custom backend of any kind.** If a desired feature requires one, we drop the feature.
5. **No wallet custody.** Keys are either imported from a hardware / browser wallet or supplied transiently for a single transaction; we never persist private keys.
6. **No email/notification/account system.**

### 1.3 Explicit trade-offs vs. `platform-explorer`

| Capability | `platform-explorer` | `native-platform-explorer` |
|---|---|---|
| Browse all blocks / all txs | ✓ (indexer list) | ✗ (not a SDK primitive) |
| Browse all identities / contracts / tokens | ✓ | ✗ |
| Search by DPNS name | ✓ | ✓ (SDK `dpns.resolveName`) |
| Search by identity / contract / tx / document ID | ✓ | ✓ |
| Reverse lookup: identity by public-key-hash | ✓ (inferred) | ✓ (SDK `identities.byPublicKeyHash`) |
| Document list **within a contract+type** | ✓ | ✓ (SDK `documents.query` WHERE/ORDER/LIMIT) |
| Contract version history | ✓ | ✓ (SDK `contracts.getHistory`) |
| Token holders / supply / price | ✓ (static snapshot) | ✓ (live) |
| Current epoch + validator proposed-blocks | ✓ | ✓ |
| Time-series charts | ✓ | ✗ |
| Tx count / gas trends | ✓ | ✗ |
| Broadcast state transition | ✓ (API endpoint) | ✓ (SDK direct, wallet-signed) |
| Proof verification in UI | ✗ | ✓ |

---

## 2. Target Users

1. **Developers** building on Dash Platform — verify their contracts, identities, and documents during integration.
2. **Token issuers & holders** — inspect token supply, current price, own balance, and distribution state.
3. **DPNS users** — check whether a name is available, contested, or resolve a handle to an identity.
4. **Masternode operators** — view proposed blocks, current epoch state, protocol upgrade vote status.
5. **Governance participants** — inspect contested resources, vote polls, and their own identity's vote history.
6. **The curious** — follow a DPNS name, identity, or contract ID and drill into related entities.

The app assumes **zero prior knowledge of Platform internals**; tooltips and contextual help explain credits, nonces, proofs, and contested-resource semantics as they are encountered.

---

## 3. System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                           BROWSER                               │
│                                                                 │
│   ┌────────────────────┐       ┌──────────────────────────┐     │
│   │  Next.js App       │       │   @dashevo/evo-sdk       │     │
│   │  (App Router,      │───►   │   (TS wrapper)           │     │
│   │   static export)   │       │                          │     │
│   │                    │◄───   │   ┌──────────────────┐   │     │
│   │  React Query       │       │   │ @dashevo/        │   │     │
│   │  nuqs (URL state)  │       │   │ wasm-sdk (WASM)  │   │     │
│   └────────────────────┘       │   └──────────────────┘   │     │
│                                │        │  │              │     │
│                                │        │  │  proof verify│     │
│                                │        │  │  (trusted)   │     │
│                                └────────┼──┼──────────────┘     │
└─────────────────────────────────────────┼──┼────────────────────┘
                                          │  │  HTTPS (gRPC-web)
                                          ▼  ▼
                              ┌───────────────────────────┐
                              │       DAPI (masternodes)  │
                              │  Platform (Tenderdash /   │
                              │  Drive / GroveDB)         │
                              └───────────────────────────┘
```

**Key properties:**

- **Single-page app**, statically exported (no Node runtime at deploy-time).
- **SDK lives in the browser** and speaks gRPC-web to DAPI endpoints.
- **Proofs are verified in-browser** by the WASM SDK against prefetched quorum public keys (trusted mode).
- **No custom server.** Absolutely everything the user sees is a direct SDK call or derivable from one.
- **Deep link → SDK call.** Routes are 1:1 with SDK queries; mounting a page fires at most a handful of calls.

---

## 4. Tech Stack

Chosen to match `platform-explorer` where reasonable so visual and structural conventions carry over directly.

| Concern | Choice | Notes |
|---|---|---|
| Framework | **Next.js 14** (App Router, `output: 'export'`) | Matches reference explorer; static-export compatible |
| Language | **TypeScript** strict mode | The SDK is TS-first; we get fully typed facades |
| UI kit | **Chakra UI 2.8** + `@emotion` | Matches reference explorer |
| Styling | SCSS modules + SASS include path `src/styles` | Same theme primitives as reference explorer |
| Data fetching | **React Query 5** (`@tanstack/react-query`) | Cache SDK responses, dedupe, retry, suspense |
| URL state | **nuqs** | Same as reference explorer |
| Tables | `@tanstack/react-table` 8 | Same as reference |
| Charts | **D3.js 7** | Same as reference; only used where SDK provides series-like data (e.g. evonode proposed blocks per epoch) |
| Identifiers / avatars | `minidenticons` | Deterministic visual identity |
| Markdown (static docs) | `react-markdown` + `remark-gfm` | For the `/about` and `/sdk-reference` pages |
| Wallet signer | Pluggable interface; first adapters: **Dash Platform Extension** (`/Users/pasta/workspace/dash-platform-extension`), **mnemonic paste** (ephemeral, session-only) | Never persisted |
| Linting | ESLint + `next/core-web-vitals` + `@typescript-eslint` | |
| Testing | Vitest + `@testing-library/react` + Playwright (e2e over the live SDK) | |
| Build | `next build && next export` → static `out/` | Ship to Vercel / Netlify / IPFS / GH Pages |

The app is **ESM-only** because `@dashevo/evo-sdk` is ESM-only.

---

## 5. SDK Capabilities & Constraints (the "what's possible" envelope)

This section is the **hard floor** for product scope. Every feature in this PRD maps to a specific SDK method; if no SDK method exists, the feature is excluded.

### 5.1 Facades used (12 + wallet namespace)

From `@dashevo/evo-sdk` v3.1.0-dev.1:

`addresses`, `identities`, `documents`, `contracts`, `tokens`, `dpns`, `epoch`, `protocol`, `stateTransitions`, `system`, `group`, `voting`, plus the `wallet` namespace.

Every facade method is either:

- **Query** (`foo()`) — read via DAPI, optionally with `…WithProof()` variant for trusted mode.
- **Write** (`foo()`) — construct + sign + broadcast state transition; always requires a signer.

### 5.2 What is queryable by-ID (single entity lookups)

All "detail pages" in Section 8 are powered by these:

| Entity | SDK method |
|---|---|
| Identity | `sdk.identities.fetch(id)` |
| Identity by public-key-hash (unique) | `sdk.identities.byPublicKeyHash(hash)` |
| Identity by non-unique pk hash | `sdk.identities.byNonUniquePublicKeyHash(hash, startAfter?)` |
| Identity balance | `sdk.identities.balance(id)` / `balanceAndRevision(id)` |
| Identity public keys | `sdk.identities.getKeys({ identityId, purpose?, securityLevel? })` |
| Identity nonce / contract nonce | `sdk.identities.nonce(id)` / `contractNonce(id, contractId)` |
| Data contract | `sdk.contracts.fetch(id)` / `getMany([ids])` |
| Contract version history | `sdk.contracts.getHistory({ dataContractId, startBlockHeight?, endBlockHeight? })` |
| Single document | `sdk.documents.get(contractId, type, documentId)` |
| Document query (within contract+type) | `sdk.documents.query({ dataContractId, documentTypeName, where?, orderBy?, limit?, offset?, startAfter? })` |
| Token total supply | `sdk.tokens.totalSupply(tokenId)` |
| Token status (frozen/paused) | `sdk.tokens.statuses([tokenIds])` |
| Token holders (per-token, across identities) | `sdk.tokens.balances([identityIds], tokenId)` |
| Identity's token balances | `sdk.tokens.identityBalances(identityId, [tokenIds])` |
| Token price / direct-purchase price | `sdk.tokens.priceByContract(contractId, position)` / `directPurchasePrices([tokenIds])` |
| Token contract info (aggregated) | `sdk.tokens.contractInfo(contractId)` |
| Perpetual distribution last claim | `sdk.tokens.perpetualDistributionLastClaim(identityId, tokenId)` |
| DPNS → identity | `sdk.dpns.resolveName(name)` |
| Identity → DPNS (primary) | `sdk.dpns.username(identityId)` |
| DPNS full username record | `sdk.dpns.getUsernameByName(name)` |
| DPNS usernames by identity / pattern | `sdk.dpns.usernames(query)` |
| DPNS availability / validity / contested | `sdk.dpns.isNameAvailable / isValidUsername / isContestedUsername` |
| Platform address balance/nonce | `sdk.addresses.get(addr)` / `getMany([addrs])` |
| Current epoch | `sdk.epoch.current()` |
| Epoch range | `sdk.epoch.epochsInfo({ startIndex?, endIndex?, count? })` |
| Finalized epoch info | `sdk.epoch.finalizedInfos(query)` |
| Proposed blocks per evonode (epoch) | `sdk.epoch.evonodesProposedBlocksByRange(...)` / `...ByIds(epoch, [proTxHashes])` |
| System status | `sdk.system.status()` |
| Current quorums | `sdk.system.currentQuorumsInfo()` |
| Total credits on Platform | `sdk.system.totalCreditsInPlatform()` |
| Prefunded specialized balance | `sdk.system.prefundedSpecializedBalance(id)` |
| Protocol upgrade state | `sdk.protocol.versionUpgradeState()` |
| Per-masternode upgrade vote | `sdk.protocol.versionUpgradeVoteStatus(startProTxHash?, count)` |
| Group info / members / actions | `sdk.group.info` / `members` / `actions` / `actionSigners` / `identityGroups` / `groupsDataContracts` |
| Contested resources (list per contract) | `sdk.group.contestedResources(votePollsByDocumentTypeQuery)` |
| Contested resource vote state | `sdk.voting.contestedResourceVoteState(query)` |
| Identity's votes on contested resources | `sdk.voting.contestedResourceIdentityVotes(query)` |
| Vote polls by end date | `sdk.voting.votePollsByEndDate(query?)` |

### 5.3 What is **not** possible (hard limits)

- No list of all identities, all contracts, all tokens, all documents (cross-contract), all addresses, all historical blocks, or all historical transactions.
- No "recent activity" feed (no tx index).
- No aggregate stats (no tx/second, no "total docs on Platform", no "top contracts").
- No reorg detection (not a property of the SDK).
- No guaranteed user-friendly name for a given contract ID — contracts don't carry names on-chain unless present in the schema; we do best-effort through a **curated well-known contracts registry** (a JSON file bundled in the app).

### 5.4 Trusted vs. untrusted mode

The app defaults to **trusted mode** (`sdk.testnetTrusted()` / `sdk.mainnetTrusted()`): queries return cryptographic proofs that the WASM SDK verifies in-browser against quorum public keys prefetched at `connect()`. Proof state is rendered visibly in the UI (see §9.7).

Untrusted mode is exposed via an advanced toggle for debugging / speed-first diagnostics, clearly marked as such.

---

## 6. Information Architecture & Routes

All routes are under Next.js App Router (`src/app/`). Dynamic segments in `[brackets]`. Every page is client-rendered (`"use client"`); we use static export + SDK-at-runtime.

### 6.1 Top-level navigation (matches `platform-explorer` navbar layout)

```
Home · Search · Identities · Contracts · Documents · Tokens · DPNS · Epoch · Governance · Network · About
```

"Governance" groups: Contested Resources, Vote Polls, Protocol Upgrade, Groups.
"Network" groups: Status, Quorums, Evonodes (current-epoch proposed blocks).

### 6.2 Route map

| Route | Page | Primary SDK call(s) |
|---|---|---|
| `/` | Home / Dashboard | `system.status`, `epoch.current`, `system.totalCreditsInPlatform`, `protocol.versionUpgradeState` |
| `/search?q=...` | Disambiguation for queries that could hit several entities | see §8.1 |
| `/identity/[id]` | Identity detail (balance, keys, nonces, DPNS, tokens, transfers, groups) | `identities.fetch`, `identities.balanceAndRevision`, `identities.getKeys`, `dpns.username`, `tokens.identityBalances` (for known tokens), `group.identityGroups`, `voting.contestedResourceIdentityVotes` |
| `/identity/lookup/[pkh]` | Reverse lookup by public-key-hash | `identities.byPublicKeyHash` (fallback `byNonUniquePublicKeyHash`) |
| `/contract/[id]` | Contract detail (schema, document types, tokens, groups, history) | `contracts.fetch`, `contracts.getHistory`, `tokens.contractInfo`, `group.groupsDataContracts` |
| `/contract/[id]/documents/[type]` | Paginated document list within a contract+type with filter/sort UI | `documents.query` |
| `/contract/[id]/documents/[type]/[docId]` | Single document view | `documents.get` |
| `/contract/[id]/tokens/[position]` | Token detail scoped to its parent contract (via position) | `tokens.calculateId`, `tokens.contractInfo`, `tokens.totalSupply`, `tokens.statuses`, `tokens.priceByContract`, `tokens.directPurchasePrices` |
| `/token/[id]` | Token detail by token ID directly | same as above but resolved from `tokenId` |
| `/token/[id]/holders` | Single-token holder query scoped to a list of candidate identities (seeded by inputs) | `tokens.balances([ids], tokenId)` — see §8.5 for the UX pattern |
| `/address/[addr]` | Platform address (balance, nonce) | `addresses.get` |
| `/dpns/[name]` | DPNS record & resolution | `dpns.resolveName`, `dpns.getUsernameByName`, `dpns.isNameAvailable`, `dpns.isContestedUsername` |
| `/dpns/search?q=...` | DPNS pattern search (by prefix/label) | `dpns.usernames` |
| `/epoch` | Current epoch dashboard | `epoch.current`, `epoch.evonodesProposedBlocksByRange` |
| `/epoch/[index]` | Historical epoch detail | `epoch.epochsInfo({ startIndex: idx, endIndex: idx })`, `epoch.finalizedInfos`, `epoch.evonodesProposedBlocksByRange` |
| `/epoch/history` | Paginated epoch browser (by index range) | `epoch.epochsInfo({ startIndex, endIndex })` |
| `/evonode/[proTxHash]` | Evonode detail — proposed blocks in selected epoch range, protocol vote status | `epoch.evonodesProposedBlocksByIds`, `protocol.versionUpgradeVoteStatus` (paged) |
| `/network/status` | System status & quorums | `system.status`, `system.currentQuorumsInfo` |
| `/network/credits` | Total credits + prefunded balances lookup | `system.totalCreditsInPlatform`, `system.prefundedSpecializedBalance(id)` on demand |
| `/network/protocol` | Protocol version upgrade state + per-masternode vote status (paged) | `protocol.versionUpgradeState`, `protocol.versionUpgradeVoteStatus` |
| `/governance/contested` | Contested resources within a chosen contract | `group.contestedResources` |
| `/governance/contested/[contractId]/[docType]/[indexName]/[indexValuesEncoded]` | Single contested-resource detail + vote tally + voters | `voting.contestedResourceVoteState`, `group.contestedResourceVotersForIdentity` |
| `/governance/polls` | Vote polls by end date | `voting.votePollsByEndDate` |
| `/groups/[contractId]` | All groups in a contract (by position) | `group.infos` |
| `/groups/[contractId]/[position]` | Single group + members + actions | `group.info`, `group.members`, `group.actions`, `group.actionSigners` |
| `/state-transition/[hash]` | State-transition status lookup (for recently broadcast txs) | `stateTransitions.waitForStateTransitionResult` |
| `/broadcast` | Optional write-mode console (see §10) | every facade's write methods |
| `/wallet` | Ephemeral signer setup (see §10) | `wallet.*` utilities |
| `/about` | Static markdown: what/why/how, privacy, proof model | — |
| `/sdk-reference` | Static: which SDK call powers which page | — |
| `/settings` | Network, trusted mode, DAPI endpoints, cache size | — |

### 6.3 Global search (`/search?q=...`)

Rules (in order):

1. If `q` is numeric and short → try as epoch index (`epoch.epochsInfo`).
2. If `q` matches base58 Identifier (32-byte, 43–44 chars) → try in parallel:
   - `identities.fetch(q)`, `contracts.fetch(q)`, `tokens.totalSupply(q)` (as token ID).
3. If `q` matches a 64-char hex string → try as a state-transition hash (`stateTransitions.waitForStateTransitionResult(q)`) or a masternode `proTxHash` (link to `/evonode/[q]`).
4. If `q` is a bech32m platform address → `addresses.get(q)`.
5. If `q` matches a public-key-hash format → `identities.byPublicKeyHash(q)` (fall through to `byNonUniquePublicKeyHash`).
6. If `q` ends in `.dash` or passes DPNS validity → `dpns.resolveName(q)` / `dpns.getUsernameByName(q)`.
7. Otherwise → DPNS prefix search (`dpns.usernames({ labelPrefix: q, limit: 20 })`).

Multiple matches are presented as a short list of "Possible matches" grouped by entity type.

Search is accessible from the navbar on every page (`GlobalSearchInput`, debounced 200ms) and mirrors `platform-explorer`'s UX.

---

## 7. Home / Dashboard (`/`)

A compact, always-accurate snapshot — **no historical charts** because the SDK cannot serve them. Instead, we showcase what IS live and verifiable.

Layout (responsive grid, matching `platform-explorer`'s Intro + cards grid):

1. **`Intro` section**
   - Title + tagline: "A proof-verified, client-only Dash Platform explorer."
   - `GlobalSearchInput` prominently placed (large).
   - Network selector badge (mainnet / testnet).
   - Trusted-mode indicator ("Proofs verified in your browser").

2. **Network summary cards** (Chakra grid, one SDK call each):
   - **Block height** — from `system.status`.
   - **Current epoch** — from `epoch.current` (index, start, end, progress bar via `EpochProgress` component borrowed from reference).
   - **Total credits** — from `system.totalCreditsInPlatform`, displayed as DASH + USD (via public rate API fetch; see §11.6).
   - **Protocol version** — from `protocol.versionUpgradeState` (current version, pending version if any, activation height).
   - **Active quorums** — from `system.currentQuorumsInfo`, count + type breakdown.

3. **Current-epoch evonodes** ("Top proposers this epoch")
   - Query `epoch.evonodesProposedBlocksByRange({ epoch: current, limit: 20, orderBy: desc })` → render a compact leaderboard with `Identifier` component + bar chart of block counts.

4. **Vote polls ending soon**
   - `voting.votePollsByEndDate({ dateRange: next 30 days, limit: 10 })` — snapshot of upcoming governance activity.

5. **Well-known contracts shortcut grid**
   - Links to: DPNS, Dashpay, Withdrawals, Masternode Rewards, Feature Flags, Wallet Utils, Keyword Search — each card hydrates a preview via `contracts.fetch(id)` on hover/idle.

6. **Quick actions panel**
   - "Look up identity by ID" → jumps to `/identity/[id]`.
   - "Resolve a DPNS name" → jumps to `/dpns/[name]`.
   - "Check a token" → jumps to `/token/[id]`.
   - "Check an epoch" → jumps to `/epoch/[index]`.

### 7.1 Explicitly absent

- No "latest transactions" feed (requires indexer).
- No "richest identities" list (no global identity enumeration).
- No TPS / block-time history charts (no historical blocks query).

---

## 8. Entity Pages

For each entity, we specify the data shown, the exact SDK calls, tabs, and how the UI degrades gracefully when optional information isn't available.

### 8.1 Identity — `/identity/[id]`

Primary SDK calls (fired in parallel on mount):

- `sdk.identities.fetch(id)` → core identity object (revision, keys, balance)
- `sdk.identities.balanceAndRevision(id)` → freshen balance even if cached identity is older
- `sdk.identities.getKeys({ identityId: id })` → full key set (for the Keys tab)
- `sdk.identities.nonce(id)` → global nonce
- `sdk.dpns.username(id)` → primary DPNS alias (if any)
- `sdk.dpns.usernames({ identityId: id })` → all DPNS names (for a list)
- `sdk.group.identityGroups({ identityId: id })` → group memberships
- `sdk.voting.contestedResourceIdentityVotes({ identityId: id })` → this identity's votes

Optional (deferred / lazy on tab open):

- `sdk.tokens.identityBalances(id, [wellKnownTokenIds])` → token balances for the curated well-known set
- `sdk.tokens.identityTokenInfos(id, [...])` → enhanced token info

Header block (`IdentityDigestCard`, matching reference explorer):
- Identifier with `minidenticon` avatar + copy.
- Primary DPNS alias (if any) as a prominent badge.
- Balance (credits + DASH + USD).
- Revision, nonce.
- "Verified by proof" badge when running in trusted mode.

Tabs:

1. **Public Keys** — table: id, purpose, type, security level, data, disabled flag. Matches reference `PublicKeyCard`.
2. **DPNS names** — list rendered via `AliasesList`; status resolved from `dpns.isContestedUsername` where relevant.
3. **Tokens** — balances for well-known tokens; a form to look up a specific token ID and add it to the view.
4. **Groups** — every group membership with a link to `/groups/[contractId]/[position]`.
5. **Votes** — list of contested resources this identity has voted on, with choices.
6. **Advanced** — contract nonces (user enters a contract ID) via `sdk.identities.contractNonce`.

### 8.2 Identity reverse-lookup — `/identity/lookup/[pkh]`

- `sdk.identities.byPublicKeyHash(pkh)` first.
- If undefined → fallback `sdk.identities.byNonUniquePublicKeyHash(pkh)` (paginated via `startAfter`).
- Present one or many results, each linking to `/identity/[id]`.

### 8.3 Data contract — `/contract/[id]`

Primary SDK calls:

- `sdk.contracts.fetch(id)` → full `DataContract`
- `sdk.tokens.contractInfo(id)` → aggregated token info (pools, positions)
- `sdk.group.groupsDataContracts([id])` → groups defined in the contract

Deferred:

- `sdk.contracts.getHistory({ dataContractId: id })` → lazily on the History tab
- `sdk.dpns.getUsernameByName(...)` for the owner (if present) and any "contract name" heuristics

Header (`DataContractDigestCard`):
- Identifier + optional friendly name (from **well-known contracts registry** — see §11.4).
- Owner identity (linked, resolves DPNS).
- Version.
- Token count, document-type count, group count.

Tabs:

1. **Schema** — `CodeBlock` rendering the full JSON Schema, with a left-side tree of document types for navigation.
2. **Document types** — one clickable chip per type; click navigates to `/contract/[id]/documents/[type]`.
3. **Tokens** — list of all tokens defined in this contract (positions 0..N) with supply / status / price.
4. **Groups** — list of defined groups (positions) → link to `/groups/[contractId]/[position]`.
5. **History** — all versions (via `getHistory`), rendered as a timeline of schema diffs (JSON diff view).
6. **Internal config** — format version, keywords (if present in schema), description (if present in schema).

### 8.4 Documents list — `/contract/[id]/documents/[type]`

Powered entirely by `sdk.documents.query`. This is the **only SDK "browse" primitive**.

UI:

- `DocumentsFilter`: dynamically generated from the contract's index definitions for that document type.
  - For each declared index, render the corresponding filter UI: text (`==`, `in`, `startsWith`), range (`<`, `<=`, `>`, `>=`), boolean.
  - Validate that the user's filter set maps to a valid index (we surface "No compound index on these fields" when it doesn't — matching Platform's query engine constraints).
- `orderBy` UI scoped to fields with declared ordering.
- `limit` selector (1–100, default 25 — SDK's server-side cap).
- Cursor-based pagination via `startAfter` (last doc ID on previous page).
- Results table: identifier, owner (linked), revision, primary displayed field(s) (heuristic: first 2 scalar properties).

Single doc click → `/contract/[id]/documents/[type]/[docId]`.

### 8.5 Single document — `/contract/[id]/documents/[type]/[docId]`

- `sdk.documents.get(contractId, type, docId)`.
- Header: doc id + avatar + owner.
- Body tabs: **Data** (`CodeBlock`) / **Metadata** (created_at, updated_at, transferred_at, price if any, revision).
- Owner clickable → `/identity/[id]`.

### 8.6 Token — `/token/[id]` and `/contract/[id]/tokens/[position]`

Both canonicalise to the same render.

Primary:

- `sdk.tokens.totalSupply(tokenId)`
- `sdk.tokens.statuses([tokenId])`
- `sdk.tokens.directPurchasePrices([tokenId])`
- `sdk.tokens.contractInfo(parentContractId)` (for distribution rules, localizations, flags)

Header (`TokenDigestCard`, matching reference):
- Token ID + avatar + localized name (from contract's `conventions.localizations`).
- Symbol, decimals.
- Total supply, max supply, base supply.
- Price (if any).
- Flags pills: mintable / burnable / freezable / unfreezable / destroyable / emergency-action.

Tabs:

1. **Overview** — all config (distribution rules, emergency actions, pre-programmed distribution, perpetual distribution rule).
2. **Holders (scoped)** — see §8.5.1.
3. **My balance** — if a wallet/identity is set in session: `sdk.tokens.identityBalances(myIdentityId, [tokenId])` + `perpetualDistributionLastClaim`.

#### 8.6.1 "Holders" tab — honest design for the no-enumeration constraint

Because the SDK lacks a "list all holders" primitive, we offer:

- **Seed list**: user pastes or types identity IDs (or DPNS names that we resolve) → we call `sdk.tokens.balances(ids, tokenId)` → show each identity's balance.
- **Saved holders**: any identity IDs the user has viewed on this explorer in this session are remembered (localStorage, opt-in) and can be batch-queried.
- **Clear messaging**: "Dash Platform does not publish a global holders index. This list is built from identities you've provided or viewed." — with a link to `/about#enumeration`.

This is the honest SDK-only equivalent to `platform-explorer`'s indexed holders list.

### 8.7 Platform address — `/address/[addr]`

- `sdk.addresses.get(addr)` → balance, nonce.
- Header + two infoline values; no tabs.

### 8.8 DPNS — `/dpns/[name]`

Primary:

- `sdk.dpns.resolveName(name)` → identity ID (or `undefined`).
- `sdk.dpns.getUsernameByName(name)` → full DPNS document.
- `sdk.dpns.isNameAvailable(name)`, `isContestedUsername(name)`, `isValidUsername(name)` — for status chips.

Renders:

- Large name + status pills (Registered / Available / Contested / Invalid).
- If registered: resolves owner identity, shows identity card (clickable).
- If contested: link to `/governance/contested/...` for the current resource vote state (we compute the resource query from contract `GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec`, type `domain`, index `parentNameAndLabel`, values `["dash", homographSafe(label)]`).

### 8.9 DPNS search — `/dpns/search?q=...`

- `sdk.dpns.usernames({ labelPrefix: q, limit: 20 })` with pagination (`startAfter`).
- Each row links to `/dpns/[name]`.

### 8.10 Epoch — `/epoch`, `/epoch/[index]`, `/epoch/history`

- **Current** (`/epoch`): `epoch.current` + `epoch.evonodesProposedBlocksByRange({ epoch: current, limit: 100, order: desc })`. Renders leaderboard, start/end timestamps, progress bar, proposed blocks bar chart (D3).
- **Historical** (`/epoch/[index]`): `epoch.epochsInfo({ startIndex: idx, endIndex: idx })` + `epoch.finalizedInfos({ startIndex: idx, endIndex: idx })` + evonode proposed blocks range for that epoch. Same layout as current.
- **History browser** (`/epoch/history?from=X&to=Y`): paged table over `epoch.epochsInfo({ startIndex, endIndex })`.

### 8.11 Evonode — `/evonode/[proTxHash]`

- `epoch.evonodesProposedBlocksByIds(epoch, [proTxHash])` — allow epoch selector (defaults to current).
- Recent upgrade-vote status (scan the paginated `protocol.versionUpgradeVoteStatus` output client-side for this proTxHash).
- If a DPNS alias exists for the identity derived from this proTxHash, show it.

### 8.12 Network / system — `/network/status` and `/network/quorums`

- `/network/status`: `system.status()` (height, chainId, versions) + `system.currentQuorumsInfo()`.
- `/network/quorums`: one row per active quorum (hash, type, size, threshold) with copy.

### 8.13 Protocol — `/network/protocol`

- `protocol.versionUpgradeState()` → current/next version + activation state.
- `protocol.versionUpgradeVoteStatus(startProTxHash, count)` → paginated per-masternode vote tally, visualized as a stacked bar ("accepted / abstained / rejected / unvoted").

### 8.14 Governance

- `/governance/contested`: requires a contract scope. User chooses from well-known contracts (starts with DPNS) or enters a contract ID → `group.contestedResources({ contractId, documentTypeName })`.
- `/governance/contested/[contractId]/[docType]/[indexName]/[indexValuesEncoded]`:
  - `voting.contestedResourceVoteState(query)` for tally.
  - `group.contestedResourceVotersForIdentity(query)` per contender to list voters.
- `/governance/polls`: `voting.votePollsByEndDate({ startDate?, endDate? })`.

### 8.15 Groups

- `/groups/[contractId]`: `group.infos({ dataContractId })`.
- `/groups/[contractId]/[position]`: `group.info(...)`, `group.members(...)`, `group.actions(...)`, `group.actionSigners(...)`.

### 8.16 State transition lookup — `/state-transition/[hash]`

For users who just broadcast a tx elsewhere and pasted the hash: `sdk.stateTransitions.waitForStateTransitionResult(hash)` with a spinner + timeout. Displays proof result when available.

### 8.17 Prefunded specialized balance — `/network/credits`

A single input field (identity ID) → `sdk.system.prefundedSpecializedBalance(id)` + `totalCreditsInPlatform()` shown alongside.

---

## 9. Visual & Design System

Matches `platform-explorer` so the two feel like siblings. Sourced from the reference frontend's theme at `/packages/frontend/src/styles/`.

### 9.1 Colors (dark-mode only)

| Token | Value | Use |
|---|---|---|
| `brand.normal` | `#008DE4` | Primary accent, interactive |
| `brand.light` | `#2CBBFF` | Highlights, focus rings |
| `brand.deep` | `#0E75B5` | Active pressed state |
| `brand.shaded` | `#165278` | Muted accent |
| `success` | `#1CC400` | Verified proof, SUCCESS status, mintable |
| `danger` | `#F45858` | Error, frozen, failed broadcast |
| `warning` | `#FFD205` | Contested, pending, near-epoch-end |
| `orange` | `#f49a58` | Secondary accent (used for tokens) |
| `gray-100` | `#e0e3e5` | Primary text |
| `gray-250` | `#93aab2` | Secondary text |
| `gray-650` | `#232C30` | Footer / panels |
| `gray-750` | `#39454C` | Card hover |
| `gray-800` | `#2e393d` | Card background |
| `gray-900` | `#181d20` | Page background |

No light mode.

**Important constraint (from user memory):** **No violet/purple accents** — we avoid the "generic AI" palette entirely. The brand blue + success green + warning yellow cover every semantic need.

### 9.2 Typography

- **Montserrat** (700) — page titles, section headings.
- **Open Sans** (400/600) — body, UI labels.
- **Roboto Mono** — every identifier, hash, hex value, JSON, amount.

All three loaded via `next/font/google`.

### 9.3 Layout primitives

- Container `max-width: 1310px`, centered.
- Responsive spacing: `$space-3 / 4 / 5 / 8` corresponding to mobile → desktop → wide breakpoints (`30em / 48em / 62em / 80em / 96em / 120em`).
- Page gutters adjust at `md` and `xl`.

### 9.4 Block / card primitive (the "glass" style)

Direct reuse of the reference's `Block()` SCSS mixin:

```scss
backdrop-filter: blur(44px);
border-radius: 30px;                // var(--chakra-radii-block)
border: 1px solid rgba(255,255,255,0.1);
background: rgba(24,31,34,0.2);
```

With an optional `box-shadow: 2px 2px $brand` for emphasized cards (header digest cards).

### 9.5 Identifier rendering

Reuse the reference's `Identifier` contract:

- Monospace font, `12pt`, `7px 12px` padding, `10px` radius.
- `minidenticons` avatar 24px with 12px right margin.
- Copy-to-clipboard button.
- Highlight modes: `dim`, `highlight`, `highlight-first`, `highlight-last`, `highlight-both` (first/last 5 chars emphasised, middle dimmed).
- Responsive wrap with `useWindowSize` debounce.

### 9.6 Tabs, tables, lists, pagination

Reuse reference components' patterns:

- `Tabs` with inline count badges (active = `rgba(0,141,228,0.2)` background, inactive = `rgba(147,170,178,0.2)`).
- `Table` with mono cells, hover, sortable headers.
- `Pagination` (react-paginate) + `PageSizeSelector`.
- `LoadingList` skeletons for list data.

### 9.7 Proof-state chip (NEW vs. reference)

Every data value (or card) that was fetched with a proof variant carries a small chip:

- `✓ Verified` (success green) — proof verified by the WASM SDK.
- `~ Unverified` (gray) — returned by `*WithProof()` but not yet verified (e.g. still in-flight) or user in untrusted mode.
- `✗ Proof failed` (danger red) — verification rejected.

A global indicator in the navbar summarises the page's proof state in aggregate.

### 9.8 Navbar + footer

- Navbar (fixed top, 66px, glassy `rgba(24,31,34,0.8)`): logo → menu (Home / Identities / Contracts / Documents / Tokens / DPNS / Epoch / Governance / Network) → `GlobalSearchInput` (15rem) → `NetworkSelect` (mainnet/testnet) → optional `WalletStatus` badge → mobile hamburger.
- Footer (fixed bottom, 66px on desktop): local time, version, GitHub link, "Proofs ON/OFF" indicator, network status copy.

---

## 10. Write mode (optional, wallet-gated)

This is **opt-in**. The default experience is 100% read-only.

### 10.1 Wallet / signer contract

A minimal internal interface we implement against multiple backends:

```ts
interface ExplorerSigner {
  identityId: Identifier;
  sign(preimage: Uint8Array, keyId: number, purpose: KeyPurpose): Promise<Uint8Array>;
  availableKeys(): IdentityPublicKey[];
}
```

### 10.2 Supported adapters (order of preference)

1. **Dash Platform Extension** (the browser extension at `/Users/pasta/workspace/dash-platform-extension`) — detected via `window.dashPlatform` or similar; prompts the user for approval per signature. **Recommended default.**
2. **Ephemeral mnemonic** — user pastes a BIP39 mnemonic into `/wallet`; we derive via `wallet.deriveKeyFromSeedWithPath` + DIP13 paths (`wallet.derivationPathDip13Testnet/Mainnet`). Kept **in-memory only** for the session. Never persisted. Cleared on navigation away from a sensitive route or after 10 minutes idle.
3. **WIF paste** — single identity key WIF for advanced users doing one-off operations.

All adapters surface the same `ExplorerSigner`.

### 10.3 Write flows — one screen per state transition

`/broadcast` hosts a tabbed console mirroring the `evo-sdk-website` pattern: facade → operation → dynamic form → review → sign → broadcast.

Supported operations (one per SDK write method):

- **Identities**: `create`, `topUp`, `creditTransfer`, `creditWithdrawal`, `update`.
- **Addresses**: `transfer`, `topUpIdentity`, `withdraw`, `transferFromIdentity`, `fundFromAssetLock`, `createIdentity`.
- **Documents**: `create`, `replace`, `delete`, `transfer`, `purchase`, `setPrice`.
- **Contracts**: `publish`, `update`.
- **Tokens**: `mint`, `burn`, `transfer`, `freeze`, `unfreeze`, `destroyFrozen`, `emergencyAction`, `setPrice`, `directPurchase`, `claim`, `configUpdate` (if exposed).
- **DPNS**: `registerName`.
- **Voting**: `masternodeVote`.

Each form:

1. **Build** — typed inputs; schema-validated if possible (e.g. document forms use the contract's JSON Schema).
2. **Review** — show decoded state transition preview; fee estimate.
3. **Sign** — invokes `ExplorerSigner`.
4. **Broadcast** — `sdk.stateTransitions.broadcastAndWait` (default) or `broadcastStateTransition` (fire-and-forget).
5. **Result** — shows proof response, a link to `/state-transition/[hash]`, and links to affected entities.

### 10.4 Safety features

- **Big red warnings** for actions that destroy state (delete, destroyFrozen, emergencyAction, update that disables keys).
- **Network confirmation**: broadcasting on **mainnet** requires an explicit checkbox + typed confirmation of the target network.
- **No key persistence** — reiterate this on every wallet-handling screen.

### 10.5 Disable path

If a deployment wants to ship read-only (e.g. public kiosk), a build-time env var `NEXT_PUBLIC_DISABLE_WRITE_MODE=true` hides the entire `/broadcast` and `/wallet` surface.

---

## 11. Cross-cutting concerns

### 11.1 SDK lifecycle

- Single `EvoSDK` instance per (network, trusted-flag) combination, held in a React Context.
- Lazy `connect()` on first use; subsequent calls no-op.
- Reconnect on network change (`NetworkSelect` invalidates the current client).
- `settings`: configurable in `/settings` — `connectTimeoutMs`, `timeoutMs`, `retries`, `banFailedAddress`.

### 11.2 Data fetching & caching

- **React Query 5** wraps every SDK call with:
  - `queryKey` = `[facade, method, args…, network, trusted]`.
  - `staleTime`: 30s for real-time (epoch/status), 5 min for structural (contract, identity keys), `Infinity` for immutable (`document.get` at a specific revision, finalized epoch).
  - `gcTime`: 24h.
- `Suspense` + `ErrorBoundary` per page.
- Prefetch on hover for navbar items and search results.
- **No persistence** of query cache by default (privacy-sensitive by design). Optional `localStorage` persistence for truly non-sensitive, schema-only data behind a setting.

### 11.3 URL state

- `nuqs` syncs filters, pagination, tab selection, query strings — every list view is deep-linkable including filter/page/size/order.
- Page titles dynamically reflect the viewed entity (e.g. `alice.dash — Native Platform Explorer`).

### 11.4 Well-known registry (bundled)

`src/constants/well-known.ts` — a JSON blob of curated metadata for widely-used system/ecosystem contracts and tokens:

```ts
export interface WellKnown {
  id: string;          // base58 identifier
  kind: 'contract' | 'token' | 'identity';
  name: string;
  description?: string;
  url?: string;
  tags?: string[];
}
```

Seeds:
- DPNS `GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec`
- Withdrawals `4fJLR2GYTPFdomuTVvNy3VRrvWgvkKPzqehEBpNf2nk6`
- Dashpay, Masternode Rewards, Feature Flags, Wallet Utils, Keyword Search (from `data-contracts` package).

This registry is the only way we give names to otherwise anonymous contract/token IDs. Users can extend it via `/settings` (local only).

### 11.5 DPNS-everywhere

Wherever an identity ID appears, we attempt `sdk.dpns.username(id)` (debounced, cached) and render the alias next to the ID. Failures are silent (identity may not have a DPNS name).

### 11.6 DASH/USD rate

Fetched directly from the browser (no backend) from one of: **Kucoin** public ticker (primary), **Coinbase** (fallback). Cached for 60s. Entirely optional — UI degrades gracefully to "credits / DASH only" if both fail. This matches `platform-explorer`'s rate behaviour.

### 11.7 Error handling

- **SDK timeouts**: reported via a toast + inline "Retry" button.
- **Not found** (e.g. identity undefined): empty-state card with suggested actions ("Try reverse lookup by pk hash").
- **Proof failures**: a dedicated `ProofFailureBanner` appears at the top of the affected card, with the option to "View unverified data" (switches this query to untrusted mode for the session only — never globally).
- **Version mismatches**: if `sdk.version() !== expected`, show a small warning; the app still works.
- **Network partitioning**: if all configured DAPI addresses fail, a full-page error with a "Try alternate DAPI endpoints" action that opens `/settings`.

### 11.8 Accessibility

- Semantic HTML through Chakra.
- Keyboard navigable (all dropdowns, search, tabs).
- Color-contrast target AA on the dark palette.
- Screen-reader labels on every `Identifier` / `CodeBlock` / copy button.
- Motion-reduced mode disables the loading gradient sweep.

### 11.9 Internationalization

- **Scope v1**: English only.
- Architecture uses plain strings + a thin `t(key)` helper so a future ICU-message layer can drop in. DPNS handles its own unicode (homograph-safety calls).

### 11.10 Privacy

- No analytics by default.
- Optional, self-hostable anonymous counter (privacy-preserving only) behind a build flag.
- All SDK traffic is gRPC-web directly from the user's browser to DAPI — the explorer operator never sees user queries.

### 11.11 Security

- **No custody of private keys.** Ever. All signer adapters follow §10.2.
- CSP headers at hosting layer disallow any external script origins other than self + DAPI.
- Subresource integrity on the `@dashevo/evo-sdk` bundle (pinned version + SRI hash in the HTML).
- Build pipeline publishes an `integrity.json` so users can verify the deployed build matches source.

---

## 12. File Structure

```
native-platform-explorer/
├── package.json                     # deps: next 14, react 18, evo-sdk, chakra, react-query, nuqs, d3, minidenticons
├── next.config.mjs                  # output: 'export', sass includePath, wasm asset copy
├── tsconfig.json
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── Providers.tsx           # Chakra + QueryClient + NuqsAdapter + SdkProvider
│   │   ├── page.tsx                # Home
│   │   ├── search/page.tsx
│   │   ├── identity/[id]/page.tsx
│   │   ├── identity/lookup/[pkh]/page.tsx
│   │   ├── contract/[id]/page.tsx
│   │   ├── contract/[id]/documents/[type]/page.tsx
│   │   ├── contract/[id]/documents/[type]/[docId]/page.tsx
│   │   ├── contract/[id]/tokens/[position]/page.tsx
│   │   ├── token/[id]/page.tsx
│   │   ├── token/[id]/holders/page.tsx
│   │   ├── address/[addr]/page.tsx
│   │   ├── dpns/[name]/page.tsx
│   │   ├── dpns/search/page.tsx
│   │   ├── epoch/page.tsx
│   │   ├── epoch/[index]/page.tsx
│   │   ├── epoch/history/page.tsx
│   │   ├── evonode/[proTxHash]/page.tsx
│   │   ├── network/{status,credits,protocol,quorums}/page.tsx
│   │   ├── governance/{contested,polls}/page.tsx
│   │   ├── governance/contested/[...slug]/page.tsx
│   │   ├── groups/[contractId]/page.tsx
│   │   ├── groups/[contractId]/[position]/page.tsx
│   │   ├── state-transition/[hash]/page.tsx
│   │   ├── broadcast/page.tsx       # optional write console
│   │   ├── wallet/page.tsx          # signer setup
│   │   ├── settings/page.tsx
│   │   └── about/page.tsx, sdk-reference/page.tsx
│   ├── sdk/
│   │   ├── SdkProvider.tsx          # React context + connect lifecycle
│   │   ├── hooks.ts                 # useSdk(), useQueryWithProof(), useBroadcast()
│   │   └── proofs.ts                # proof-state utilities
│   ├── signer/
│   │   ├── types.ts                 # ExplorerSigner interface
│   │   ├── extension.ts             # dash-platform-extension adapter
│   │   ├── mnemonic.ts              # ephemeral mnemonic adapter
│   │   └── wif.ts                   # WIF paste adapter
│   ├── components/
│   │   ├── layout/{Navbar,Footer,RootComponent,NetworkSelect}.tsx
│   │   ├── data/{Identifier,CodeBlock,CreditsBlock,DateBlock,TimeDelta,InfoLine,Alias,AliasesList,VoteChoice,ProofChip}.tsx
│   │   ├── cards/{InfoCard,ValueCard,DashboardCard,CardsGrid}.tsx
│   │   ├── ui/{Button,Tabs,Table,Tooltip,Popover,CopyButton,BottomSheet,MultiLevelMenu}.tsx
│   │   ├── search/{GlobalSearchInput,SearchResultsList}.tsx
│   │   ├── filters/{FilterGroup,InputFilter,RangeFilter,DateRangeFilter,MultiSelectFilter}.tsx
│   │   ├── charts/{LineGraph,EvonodeBars}.tsx
│   │   ├── pagination/{Pagination,PageSizeSelector}.tsx
│   │   ├── breadcrumbs/{Breadcrumbs,BreadcrumbsContext}.tsx
│   │   ├── identity/{IdentityDigestCard,IdentityTotalCard,PublicKeyCard}.tsx
│   │   ├── contract/{DataContractDigestCard,SchemaTree,SchemaDiff}.tsx
│   │   ├── document/{DocumentsFilter,DocumentsList,DocumentDigestCard}.tsx
│   │   ├── token/{TokenDigestCard,TokenFlagsPills,TokenHoldersScoped}.tsx
│   │   ├── epoch/{EpochProgress,EvonodesLeaderboard}.tsx
│   │   ├── governance/{VoteTallyBar,VotePollsList,VoteChoiceBadge}.tsx
│   │   └── broadcast/{FacadeSelector,OperationForm,ReviewStep,SignStep,ResultStep}.tsx
│   ├── styles/
│   │   ├── theme.ts                 # Chakra extendTheme
│   │   ├── colors.ts                # palette tokens
│   │   ├── global.scss
│   │   ├── mixins.scss              # Block(), DefListItem(), LoadingLine() (reused from reference)
│   │   └── fonts.ts                 # next/font Montserrat + Open Sans + Roboto Mono
│   ├── enums/
│   │   ├── keyPurpose.ts, keyType.ts, securityLevel.ts
│   │   ├── choiceEnum.ts (yes/abstain/lock)
│   │   └── tokenActions.ts
│   ├── constants/
│   │   ├── networks.ts              # DAPI endpoints per network
│   │   ├── well-known.ts            # curated contract/token registry
│   │   └── system-data-contracts.ts # DPNS, Dashpay, Withdrawals, etc. IDs
│   ├── hooks/
│   │   ├── useDebounce.ts, useFilters.ts, useWindowSize.ts, usePrevious.ts
│   │   ├── useDpnsAlias.ts          # memoised DPNS lookup for an identity id
│   │   └── useWellKnownName.ts
│   ├── util/
│   │   ├── credits.ts               # creditsToDash, numberFormat
│   │   ├── datetime.ts              # formatDate, getTimeDelta, iso8601duration
│   │   ├── identifier.ts            # is43-44Base58, is64Hex, isBech32mAddress
│   │   ├── dpns.ts                  # convertToHomographSafeChars, validateLabel
│   │   ├── json.ts                  # stable stringify, JSON diff
│   │   ├── rate.ts                  # kucoin primary, coinbase fallback
│   │   └── errors.ts                # SdkError classification
│   └── tests/
│       ├── unit/*.spec.ts
│       └── e2e/*.spec.ts            # Playwright over live testnet
└── public/
    └── wasm/                        # evo-sdk wasm artifact if not self-hosted by the npm pkg
```

---

## 13. Feature Matrix (at-a-glance)

| Feature | Supported | SDK call(s) |
|---|---|---|
| Home: height, epoch, credits, protocol, quorums | ✓ | `system.status`, `epoch.current`, `system.totalCreditsInPlatform`, `protocol.versionUpgradeState`, `system.currentQuorumsInfo` |
| Global search (id / name / address / pk hash / tx hash / epoch) | ✓ | per §6.3 |
| Identity detail | ✓ | `identities.fetch` + deps |
| Identity reverse-lookup by pk hash | ✓ | `identities.byPublicKeyHash` / `byNonUniquePublicKeyHash` |
| Identity key inspection | ✓ | `identities.getKeys` |
| Identity nonces (global + per-contract) | ✓ | `identities.nonce` / `contractNonce` |
| Identity token balances (for known tokens) | ✓ | `tokens.identityBalances` |
| Identity group memberships | ✓ | `group.identityGroups` |
| Identity votes history | ✓ | `voting.contestedResourceIdentityVotes` |
| Contract detail + schema + document types | ✓ | `contracts.fetch` |
| Contract version history | ✓ | `contracts.getHistory` |
| Document query within contract+type | ✓ | `documents.query` |
| Single document | ✓ | `documents.get` |
| Token detail (supply, status, price, config) | ✓ | `tokens.totalSupply` + `statuses` + `directPurchasePrices` + `contractInfo` |
| Token holders (**scoped / seeded**) | ✓ | `tokens.balances([ids], tokenId)` |
| Platform address | ✓ | `addresses.get` |
| DPNS resolve / name availability / contested check | ✓ | `dpns.resolveName`, `isNameAvailable`, `isContestedUsername`, `getUsernameByName` |
| DPNS prefix search | ✓ | `dpns.usernames` |
| Current epoch + proposed blocks leaderboard | ✓ | `epoch.current` + `epoch.evonodesProposedBlocksByRange` |
| Historical epoch detail | ✓ | `epoch.epochsInfo`, `finalizedInfos` |
| Per-evonode proposed blocks | ✓ | `epoch.evonodesProposedBlocksByIds` |
| Protocol upgrade state + per-masternode vote | ✓ | `protocol.*` |
| Contested resources per contract | ✓ | `group.contestedResources` |
| Contested resource vote tally + voters | ✓ | `voting.contestedResourceVoteState`, `group.contestedResourceVotersForIdentity` |
| Vote polls by end date | ✓ | `voting.votePollsByEndDate` |
| Groups within a contract; members; actions | ✓ | `group.*` |
| Prefunded specialized balance lookup | ✓ | `system.prefundedSpecializedBalance` |
| State-transition result by hash | ✓ | `stateTransitions.waitForStateTransitionResult` |
| Proof verification UI (chips, banner) | ✓ | trusted-mode `…WithProof` variants |
| **Broadcast any state transition** (opt-in) | ✓ | every write facade |
| **Global list of identities / contracts / tokens / tx / blocks** | ✗ | not a SDK primitive |
| **Time-series charts** (tx/hour, tps, gas) | ✗ | requires indexer |
| **Aggregate statistics** (total docs, richest identities, trending tokens) | ✗ | requires indexer |

---

## 14. Non-functional requirements

### 14.1 Performance

- **First paint < 2s** on a 50 Mbps connection (WASM blob is ~several MB; we lazy-load it on first SDK use, so static home paint is independent).
- **SDK connect < 2s** to testnet from a residential US connection.
- **Query latency budget** (trusted mode, proof verified):
  - Identity / contract / single doc fetch: target p50 < 1s.
  - Document query (limit=25): target p50 < 2s.
  - Evonode proposed blocks for current epoch: target p50 < 2s.
- **Re-renders**: React Query + Suspense keeps most interactions under 100ms after cache hit.

### 14.2 Browser support

- Latest 2 versions of Chrome / Edge / Firefox / Safari.
- WASM required (drops IE, old Safari).

### 14.3 Offline / resilience

- Service Worker caches app shell + static assets so the UI loads offline; SDK calls fail gracefully with clear messaging.
- If a single DAPI endpoint fails, the SDK's built-in `banFailedAddress` behaviour takes over (configurable).

### 14.4 Observability

- **Structured client logs** (opt-in) via the SDK's `logs` option (`'info'` default in dev, `'warn'` in prod).
- Errors surfaced to an in-app "Diagnostics" drawer (`⌘/` toggle), never to external telemetry by default.

### 14.5 Versioning & backwards compatibility

- Pinned to a minor range of `@dashevo/evo-sdk` (`~3.x`). Breaking SDK changes (e.g. v3.0 renames from `v3-sdk-breaking-changes.md`) require an explicit PR.
- Build embeds SDK + app version in a footer pill and on the `/about` page.

---

## 15. Build & Deployment

### 15.1 Local development

```
git clone <repo>
cd native-platform-explorer
pnpm install
pnpm dev
```

- `next dev` runs locally; SDK talks to testnet by default.
- `.env.local` can override `NEXT_PUBLIC_NETWORK`, `NEXT_PUBLIC_DAPI_ADDRESSES`, `NEXT_PUBLIC_DISABLE_WRITE_MODE`.

### 15.2 Production build

```
pnpm build         # next build + next export → out/
```

Fully static; deployable to any static host.

### 15.3 Deployment targets

- **Vercel** (default).
- **Netlify**, **Cloudflare Pages**, **GitHub Pages**.
- **IPFS / Arweave** — app is immutable per-version, content-addressable build outputs.

### 15.4 CI/CD (GitHub Actions)

- `build.yml` — lint + typecheck + unit tests + Playwright e2e against testnet.
- `deploy.yml` — on tag `v*.*.*`: build → publish static artifact to Vercel (production) and the IPFS pin (immutable record).
- `sbom.yml` — emit Software Bill of Materials + SRI hashes for the SDK bundle.

### 15.5 Configuration (env vars, all public)

| Var | Purpose | Default |
|---|---|---|
| `NEXT_PUBLIC_DEFAULT_NETWORK` | `mainnet` or `testnet` | `testnet` |
| `NEXT_PUBLIC_TRUSTED_MODE` | `'true'` / `'false'` | `'true'` |
| `NEXT_PUBLIC_DAPI_ADDRESSES_TESTNET` | comma-separated custom DAPI URLs | (SDK default list) |
| `NEXT_PUBLIC_DAPI_ADDRESSES_MAINNET` | idem | (SDK default list) |
| `NEXT_PUBLIC_DISABLE_WRITE_MODE` | hide `/broadcast` and `/wallet` | `'false'` |
| `NEXT_PUBLIC_RATE_PROVIDER` | `kucoin` / `coinbase` / `none` | `kucoin` |
| `NEXT_PUBLIC_WELL_KNOWN_URL` | optional override of `well-known.ts` (JSON at a URL) | — |

---

## 16. Known limitations

| Limitation | Root cause | Mitigation |
|---|---|---|
| No global "latest blocks / latest txs" feed | SDK cannot list blocks / transactions | Home surfaces epoch & evonode data instead |
| No list of all identities / contracts / tokens | SDK has no enumeration primitive | Search-first UX; well-known registry; per-contract listings wherever possible |
| Token "holders" is only as complete as the seed list | `tokens.balances` takes `[identityIds] × tokenId` only | Clear UI labelling; seed from viewed identities (localStorage opt-in) |
| No proof for `system.status` and `currentQuorumsInfo` | SDK does not offer proof variants | ProofChip renders "N/A" — clearly labelled |
| No historical charts / time-series | Would need an indexer | Stated explicitly in the PRD's Non-Goals |
| Broadcast requires wallet integration | Correct behaviour for a non-custodial tool | Adapters in §10 |
| WASM bundle size on first load | SDK footprint | Lazy-load on first SDK use; app shell paints independently |
| DAPI availability varies by masternode | Masternodes can go down | SDK's `banFailedAddress` retries alternates; settings page lets user add DAPI URLs |

---

## 17. Open questions

1. **Should the well-known registry be crowd-sourced?** A signed JSON file in a separate repo with a PR review process would keep the client code free of vendor decisions. Leaning yes, but out of v1 scope.
2. **How to handle v3 SDK breaking changes going forward?** Adopt the "pin minor, PR per minor bump" policy documented in §14.5; requires a short smoke-test matrix.
3. **Should we ship an embeddable widget?** (e.g. `<native-pe-identity id="..."/>`) — deferred to v2.
4. **Should there be an explicit "Favorite this identity / contract" feature?** — yes, stored in `localStorage`, proposed for v1.1.

---

## 18. Appendix: SDK-call index (for fast reference)

Every route maps to one or more facade methods. This table is the canonical "if the SDK lost support, this page breaks" mapping.

| Route | SDK calls |
|---|---|
| `/` | `system.status`, `epoch.current`, `system.totalCreditsInPlatform`, `protocol.versionUpgradeState`, `system.currentQuorumsInfo`, `epoch.evonodesProposedBlocksByRange`, `voting.votePollsByEndDate` |
| `/search` | any of (§6.3 rules) |
| `/identity/[id]` | `identities.fetch`, `identities.balanceAndRevision`, `identities.getKeys`, `identities.nonce`, `dpns.username`, `dpns.usernames`, `group.identityGroups`, `voting.contestedResourceIdentityVotes`, `tokens.identityBalances` |
| `/identity/lookup/[pkh]` | `identities.byPublicKeyHash` (→ fallback `byNonUniquePublicKeyHash`) |
| `/contract/[id]` | `contracts.fetch`, `tokens.contractInfo`, `group.groupsDataContracts`, `contracts.getHistory` (lazy) |
| `/contract/[id]/documents/[type]` | `documents.query` |
| `/contract/[id]/documents/[type]/[docId]` | `documents.get` |
| `/token/[id]` | `tokens.totalSupply`, `tokens.statuses`, `tokens.directPurchasePrices`, `tokens.contractInfo`, `tokens.priceByContract` |
| `/token/[id]/holders` | `tokens.balances([seedIds], tokenId)` |
| `/address/[addr]` | `addresses.get` |
| `/dpns/[name]` | `dpns.resolveName`, `dpns.getUsernameByName`, `dpns.isNameAvailable`, `dpns.isContestedUsername`, `dpns.isValidUsername` |
| `/dpns/search` | `dpns.usernames` |
| `/epoch` | `epoch.current`, `epoch.evonodesProposedBlocksByRange` |
| `/epoch/[index]` | `epoch.epochsInfo`, `epoch.finalizedInfos`, `epoch.evonodesProposedBlocksByRange` |
| `/epoch/history` | `epoch.epochsInfo` (paginated) |
| `/evonode/[proTxHash]` | `epoch.evonodesProposedBlocksByIds`, `protocol.versionUpgradeVoteStatus` |
| `/network/status` | `system.status`, `system.currentQuorumsInfo` |
| `/network/credits` | `system.totalCreditsInPlatform`, `system.prefundedSpecializedBalance` |
| `/network/protocol` | `protocol.versionUpgradeState`, `protocol.versionUpgradeVoteStatus` |
| `/network/quorums` | `system.currentQuorumsInfo` |
| `/governance/contested` | `group.contestedResources` |
| `/governance/contested/[...]` | `voting.contestedResourceVoteState`, `group.contestedResourceVotersForIdentity` |
| `/governance/polls` | `voting.votePollsByEndDate` |
| `/groups/[contractId]` | `group.infos` |
| `/groups/[contractId]/[position]` | `group.info`, `group.members`, `group.actions`, `group.actionSigners` |
| `/state-transition/[hash]` | `stateTransitions.waitForStateTransitionResult` |
| `/broadcast` | every write facade method |
| `/wallet` | `wallet.*` utilities (no network) |

---

*Document prepared in response to the brief: "PRD for `native-platform-explorer` — no backend, no indexer, evo-sdk only, match platform-explorer style and structure, reduce scope as needed but maximise SDK coverage."*
