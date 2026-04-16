# Stage 2: Single-entity detail pages

> Stage 2 of 6 in the `native-platform-explorer` build plan.
> **Previous stage:** Stage 1 shipped a themed Next.js shell with SDK provider and placeholder pages.
> **This stage delivers:** every by-ID entity detail page (identity, contract, token, document, address, DPNS, state transition) working end-to-end against the live SDK, plus the real global search dispatcher.

## Mission

Turn the placeholder detail pages from Stage 1 into real, working explorer views. Every entity the SDK can fetch by ID gets a detail page that fires the appropriate SDK call(s), renders the data with proper styling, and links out to related entities.

At the end of Stage 2, the app becomes genuinely useful: paste an identity / contract / document / token / address / DPNS name / tx hash into search, get taken to the right page, and drill around.

## Required reading

- `docs/PRD.md` — sections 5 (SDK Capabilities), 6 (Routes), 8.1–8.9 and 8.16 (entity pages), 9 (Design System), 11 (Cross-cutting concerns, especially 11.5 DPNS-everywhere and 11.6 DASH/USD rate).
- `/Users/pasta/workspace/platform/packages/js-evo-sdk/src/identities/facade.ts`, `contracts/facade.ts`, `documents/facade.ts`, `tokens/facade.ts`, `addresses/facade.ts`, `dpns/facade.ts`, `state-transitions/facade.ts`, `system/facade.ts`, `group/facade.ts`, `voting/facade.ts`. Scan each facade file — you need to know the exact method signatures and return types to build correct React Query hooks.
- Reference-explorer components we'll port/mirror:
  - `/Users/pasta/workspace/platform-explorer/packages/frontend/src/components/data/` (Identifier, CodeBlock, CreditsBlock, InfoLine, Alias, AliasesList, DateBlock, TimeDelta, BigNumber)
  - `/Users/pasta/workspace/platform-explorer/packages/frontend/src/components/identities/IdentityDigestCard*`, `IdentityTotalCard*`
  - `/Users/pasta/workspace/platform-explorer/packages/frontend/src/components/dataContracts/DataContractDigestCard*`
  - `/Users/pasta/workspace/platform-explorer/packages/frontend/src/components/documents/DocumentDigestCard*`
  - `/Users/pasta/workspace/platform-explorer/packages/frontend/src/components/tokens/TokenDigestCard*`, `TokenFlagsPills*`
  - `/Users/pasta/workspace/platform-explorer/packages/frontend/src/components/platformAddresses/`
  - `/Users/pasta/workspace/platform-explorer/packages/frontend/src/util/Api.js` — for the URL shape/parameter patterns you'll want to mirror in your SDK hooks.
- `docs/progress.md` — confirm Stage 1 is marked complete.

## Assumed state entering this stage

- Stage 1 is committed on `main`. Verify `docs/progress.md` shows Stage 1 ✅ before continuing. If Stage 1 is not complete, stop and ask the user.
- `pnpm dev`, `lint`, `typecheck`, `test`, `build` all pass.
- SDK connects on load.
- Every planned route has a placeholder page.

## Scope — in

### 1. SDK query hooks

Extend `src/sdk/hooks.ts` with strongly-typed React Query wrappers around each SDK method you'll use in this stage. Conventions:

- Name hooks `use<Facade><Method>` — e.g. `useIdentity(id)`, `useIdentityKeys(id, query)`, `useContract(id)`, `useDocumentsQuery(query)`, `useDocumentGet(contractId, type, docId)`, `useTokenTotalSupply(tokenId)`, `useTokenStatus(tokenId)`, `useAddressInfo(addr)`, `useDpnsResolve(name)`, `useDpnsUsername(identityId)`, `useStateTransitionResult(hash)`.
- Each hook returns `UseQueryResult<ReturnType>`.
- `queryKey = ['<facade>', '<method>', ...args, network, trusted]`.
- `staleTime`: 30s for live/status data, 5min for structural (contract, identity keys), `Infinity` for immutable (document at revision, finalized epoch).
- Handle `undefined` return values gracefully (many SDK methods return `undefined` for "not found").
- **Always default to trusted-mode (`…WithProof()`) variants.** Expose a non-proof variant only where the SDK has no `WithProof` sibling (see each facade's surface).

Create `src/sdk/useDpnsAlias.ts`:
- Given an identity ID, returns `{ alias: string | undefined, loading: boolean, isContested: boolean }`.
- Implemented with `useDpnsUsername(identityId)` + `useDpnsIsContestedUsername(alias)` when an alias exists.
- Memoised and deduplicated across components.

### 2. Global search dispatcher (`/search?q=...`)

Implement the dispatcher logic per PRD §6.3 in `src/app/search/page.tsx` + `src/util/search.ts`:

- Classify the input string:
  - Numeric (short) → candidate epoch index.
  - 43–44 char base58 (Platform `Identifier`) → candidate identity / contract / token.
  - 64-char hex → candidate state-transition hash / proTxHash.
  - bech32m address → platform address.
  - Public-key-hash shape (20 bytes hex, or 40 hex chars) → identity reverse lookup.
  - Valid DPNS username → DPNS resolve + prefix search.
- Fire parallel lookups in appropriate categories using React Query `useQueries`.
- Render a "Possible matches" grid, one card per resolved hit (grouped by entity), each linking to its detail page. If there is **exactly one** definitive hit, auto-redirect to that page (use `router.replace` with a visible "Redirecting to …" countdown).
- If **nothing** matches, show a helpful empty state with links to the documented search rules.
- Wire `GlobalSearchInput` (from Stage 1): on submit, navigate to `/search?q=<encoded>`.

### 3. Core data-display components

Port from the reference explorer. TypeScript + Chakra. These are the heart of Stage 2.

- `src/components/data/Identifier.tsx` — final full version. Props: `value: string`, `avatar?: boolean`, `copy?: boolean`, `ellipsis?: 'auto' | 'always' | 'never'`, `highlight?: 'none' | 'dim' | 'highlight' | 'first' | 'last' | 'both'`, `as?: 'span' | 'div'`, `href?: string`. Uses `minidenticons` for avatars. Responsive wrap via `useWindowSize`.
- `src/components/data/CodeBlock.tsx` — JSON pretty-printer with copy + expand/collapse (Framer Motion for the height animation). Accepts `value: unknown` or `value: string`.
- `src/components/data/CreditsBlock.tsx` — accepts `credits: bigint | number | string`, renders `X credits / Y.ZZZZ DASH / $U.UU USD` stacked. Uses `creditsToDash` and the live rate.
- `src/components/data/InfoLine.tsx` — label/value row, pairs beautifully with `CodeBlock`, `Identifier`, or plain text.
- `src/components/data/Alias.tsx` — DPNS alias chip with optional status (ok / contested / pending).
- `src/components/data/AliasesList.tsx` — list of aliases with status chips.
- `src/components/data/DateBlock.tsx` — formatted absolute date + tooltip with relative time.
- `src/components/data/TimeDelta.tsx` — renders `getTimeDelta` (default / detailed).
- `src/components/data/BigNumber.tsx` — large numbers with grouping.
- `src/components/data/NotActive.tsx` — the muted "—" placeholder for missing values.

Add supporting utilities in `src/util/`:

- `credits.ts` (extend): `creditsToDash`, `creditsToDashString`, `formatCredits`.
- `datetime.ts`: `getTimeDelta`, `formatDate`, `iso8601duration`.
- `identifier.ts`: `isBase58Identifier`, `isHex64`, `isBech32mAddress`, `isPublicKeyHash`, `looksLikeDpnsName`.
- `dpns.ts`: `convertToHomographSafeChars`, `validateLabel`.
- `rate.ts`: `fetchDashUsdRate` with Kucoin primary + Coinbase fallback. Cached for 60s via React Query hook `useDashUsdRate()`.
- `numbers.ts`: `numberFormat`, `currencyRound`, `removeTrailingZeros`.

### 4. Entity detail pages

Each page below must:

- Fire its SDK calls in parallel using React Query.
- Render a Digest card header + tabs.
- Update `useBreadcrumbs` with a correct trail.
- Resolve the owner/related identity's DPNS alias (`useDpnsAlias`) for any identity ID it displays.
- Gracefully handle not-found (SDK returns `undefined` → friendly empty state with suggested next steps).
- Keep each page as a thin composition of reusable components (see inventory in step 3 and digest cards below).

#### 4a. `/identity/[id]` — `src/app/identity/[id]/page.tsx`

SDK calls (parallel on mount):
- `identities.fetch(id)`
- `identities.balanceAndRevision(id)`
- `identities.getKeys({ identityId: id })`
- `identities.nonce(id)`
- `dpns.username(id)`
- `dpns.usernames({ identityId: id })` (for the DPNS tab)
- `group.identityGroups({ identityId: id })` (for the Groups tab — populate lazily on tab open)
- `voting.contestedResourceIdentityVotes({ identityId: id })` (lazy on tab open)

Component tree:
- `IdentityDigestCard` (new, in `src/components/identity/`) — header: Identifier with avatar + copy, primary DPNS alias badge, balance (CreditsBlock), revision, nonce, trusted-proof badge placeholder (fully implemented in Stage 5 — render as TBD here).
- `Tabs`: Keys · DPNS · Tokens (reduced to "no well-known tokens configured yet" placeholder — real UX in Stage 4) · Groups · Votes · Advanced (contract nonce lookup form).
  - **Keys** tab: table (id, purpose, type, securityLevel, data, disabled). Port `PublicKeyCard` styling.
  - **DPNS** tab: `AliasesList` with all found aliases.
  - **Tokens** tab: a simple placeholder card ("Provide a token ID to query balance" + input field → calls `tokens.identityBalances(id, [tokenId])`).
  - **Groups** tab: list of `(contractId, position)` with links to `/groups/[contractId]/[position]`.
  - **Votes** tab: each row is `(resource → choice)` with a link to the contested resource detail.
  - **Advanced** tab: input field for contract ID → `identities.contractNonce(id, contractId)`.

#### 4b. `/identity/lookup/[pkh]`

- `identities.byPublicKeyHash(pkh)` first. If `undefined` → `identities.byNonUniquePublicKeyHash(pkh)` paginated (show a "Load more" that passes `startAfter`).
- Render results as identity cards linking to `/identity/[id]`.

#### 4c. `/contract/[id]`

SDK calls:
- `contracts.fetch(id)`
- `tokens.contractInfo(id)` (if `hasTokens` on contract)
- `group.groupsDataContracts([id])` (for Groups tab)
- `contracts.getHistory({ dataContractId: id })` lazily on History tab.

Components:
- `DataContractDigestCard` — header: Identifier + copy, friendly name from `useWellKnownName(id)` if present, owner (Identifier + DPNS alias), version, counts (document types, tokens, groups), createdAt / updatedAt if exposed.
- Tabs: Schema · Document types · Tokens · Groups · History · Internal config.
  - **Schema**: `CodeBlock` with the full JSON schema; optional `SchemaTree` sidebar listing document types (can be a basic list in Stage 2; richer tree in Stage 3).
  - **Document types**: list of types → links to `/contract/[id]/documents/[type]`.
  - **Tokens**: basic list of tokens defined in the contract with links to `/contract/[id]/tokens/[position]`. Detailed token view is in 4f.
  - **Groups**: list of `(contractId, position)` with links to `/groups/[contractId]/[position]`.
  - **History**: vertical timeline of versions, each with a "View JSON" expander. (The diff renderer lands in Stage 3 — for Stage 2 just show the raw JSON of each version.)
  - **Internal config**: keywords, description, version, format version.

Create `src/hooks/useWellKnownName.ts`: looks up an ID in `src/constants/well-known.ts` and returns `{ name, tags, url }` if present.

#### 4d. `/contract/[id]/documents/[type]/[docId]` (single document)

- `documents.get(contractId, type, docId)`.
- Header: document Identifier, owner Identifier (with alias), revision, createdAt, updatedAt.
- Tabs: **Data** (`CodeBlock`) · **Metadata** (revision, createdAt, updatedAt, transferredAt if any, price if any).
- Breadcrumb trail: Contract → Documents ([type]) → [docId].

> `/contract/[id]/documents/[type]` (list) is **not** in scope this stage — it requires the `documents.query` browser UI which is Stage 3. Leave its Stage-1 placeholder in place.

#### 4e. `/token/[id]` and `/contract/[id]/tokens/[position]`

Both canonicalise to the same render. Implement the logic in a shared `src/app/token/[id]/TokenView.tsx` component.

SDK calls:
- `tokens.totalSupply(tokenId)`
- `tokens.statuses([tokenId])`
- `tokens.directPurchasePrices([tokenId])`
- `tokens.contractInfo(parentContractId)` if we have it (when arriving via `/contract/[id]/tokens/[position]`, we can compute `tokenId` via `tokens.calculateId(contractId, position)`).

Components:
- `TokenDigestCard` — Identifier + avatar + localized name + symbol, decimals, totalSupply / maxSupply / baseSupply, price, flags pills (see below).
- `TokenFlagsPills` — pills for mintable / burnable / freezable / unfreezable / destroyable / emergencyAction.
- Tabs: **Overview** · **My balance** (only if a wallet session is set in Stage 6; for now, hidden).
- **Holders** tab: placeholder for now — real UX arrives in Stage 4. Leave a "Seeded holders" card that says "Seeded holders UX arrives in Stage 4" with a disabled form.

> `/token/[id]/holders` route: keep the Stage-1 placeholder. Full implementation in Stage 4.

#### 4f. `/address/[addr]`

- `addresses.get(addr)`.
- Header: `Identifier` with the address in mono, balance (`CreditsBlock`), nonce.
- No tabs.

#### 4g. `/dpns/[name]`

- `dpns.getUsernameByName(name)` → full DPNS record.
- `dpns.resolveName(name)` → identity ID.
- `dpns.isNameAvailable(name)`, `isContestedUsername(name)`, `isValidUsername(name)` → status pills.
- If resolved: render an identity preview card (avatar, balance, DPNS primary alias) that links to `/identity/[id]`.
- If contested: compute the contested-resource path (contract = DPNS, type = `domain`, index = `parentNameAndLabel`, values = `["dash", homographSafe(label)]`) and link to `/governance/contested/...` (Stage 4 target; link will render but the destination page still shows Stage-1 placeholder).

#### 4h. `/state-transition/[hash]`

- `stateTransitions.waitForStateTransitionResult(hash)` with a spinner and visible timeout.
- On success, render the result as a `CodeBlock`. If a proof is available, show a second `CodeBlock` titled "Proof" (the fancy proof UI comes in Stage 5).
- Provide a "Retry" button.
- Provide deep links to affected entities where discoverable from the response.

### 5. Breadcrumbs for every detail page

Use `useBreadcrumbs`. Trail examples:

- `/identity/[id]` → `Home › Identity › [short id]`
- `/contract/[id]` → `Home › Contract › [short id]`
- `/contract/[id]/documents/[type]/[docId]` → `Home › Contract › [short contract] › Documents › [type] › [short doc]`
- `/token/[id]` → `Home › Token › [short id]`
- `/dpns/[name]` → `Home › DPNS › [name]`

Use `Identifier` avatars in the final segment where sensible.

### 6. Link-out everywhere

Every identity ID displayed anywhere links to `/identity/[id]`. Every contract ID to `/contract/[id]`. Every document ID to `/contract/[contract]/documents/[type]/[id]`. Every token ID to `/token/[id]`. Every address to `/address/[addr]`. Every DPNS name to `/dpns/[name]`. Use `next/link`; pass styling props on `<Identifier href="…" />`.

### 7. Not-found & loading UX

- Each detail page must show:
  - A skeleton card while fetching (port the LoadingLine mixin / reference's loading skeletons).
  - A clear "Not found" card when the SDK returns `undefined`. Include suggested next actions ("Try reverse lookup", "Return home", "Search again").
  - A themed error card when the SDK throws. Includes a "Retry" button that invalidates the query.

### 8. DPNS-everywhere

Wherever an identity `Identifier` is rendered, resolve the alias via `useDpnsAlias` and render it next to the ID as an `Alias` chip. Debounce so that scrolling a long list doesn't spam DAPI. Use React Query's dedupe + staleTime (5min) to avoid duplicate lookups.

## Scope — out (do NOT build in this stage)

- No list/browse pages — `/contract/[id]/documents/[type]`, `/token/[id]/holders`, `/epoch`, `/epoch/history`, `/dpns/search`, `/evonode/[proTxHash]`, governance and network pages stay as Stage-1 placeholders.
- No home dashboard upgrade — `/` stays simple (you can add a navbar shortcut panel, but no real dashboard yet).
- No charts, no filters UI for lists.
- No proof chips/banner — the placeholder TBD badges are fine. Full proof UX lands in Stage 5.
- No wallet, no /broadcast.
- No schema-diff renderer (Stage 3).

## Acceptance criteria

- [ ] Paste a known testnet identity ID into the navbar search → land on `/identity/[id]` with real data rendered.
- [ ] Paste a known testnet contract ID (e.g. DPNS `GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec`) → `/contract/[id]` renders the schema, owner, tokens/groups counts, and Document-types links.
- [ ] Paste `dash.dash` (or any registered DPNS name on testnet) → `/dpns/dash.dash` renders with the resolved identity preview.
- [ ] Paste a known token ID → `/token/[id]` renders supply, status, flags.
- [ ] Clicking any identity/contract/token/document Identifier anywhere navigates to the corresponding detail page.
- [ ] `/search` dispatcher correctly routes ambiguous strings, auto-redirects single definitive matches, and renders "Possible matches" for multi-hit queries.
- [ ] DPNS aliases appear next to identity IDs everywhere they are rendered, without flooding DAPI (check the network tab; you should see dedup/cache hits after the first few).
- [ ] Not-found pages render a helpful empty state; errors render a retry card.
- [ ] All data rendered in `CodeBlock` is valid JSON, pretty-printed, copyable.
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` all pass.
- [ ] New unit tests cover: `search.ts` classifier (at least one happy-path per branch), `credits.ts` edge cases, `dpns.ts` homograph safety, `rate.ts` Kucoin→Coinbase fallback.
- [ ] Playwright smoke test extended to navigate to a known identity detail page and assert the DigestCard renders.

## Testing

- Unit tests for every non-trivial util in step 3.
- Component tests (React Testing Library) for `Identifier`, `CreditsBlock`, `InfoLine`.
- Playwright: extend the smoke test to click through `/` → search → `/identity/[id]`. Use a deterministic testnet identity and mark the test skipped if DAPI is unreachable (don't flake CI on upstream outages).

## Performance guardrails

- No N+1 DPNS lookups. Use React Query's shared cache and a debounced-by-key pattern.
- `useQueries` for parallel fan-out on the detail pages.
- `staleTime` tuned per entity class (per PRD §11.2).

## When complete

1. Run `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.
2. Smoke-test manually with a handful of real testnet IDs (identity / contract / document / token / address / DPNS / tx hash).
3. Stage files with explicit `git add` (no `git add -A`); commit with:
   ```
   feat(detail-pages): identity/contract/token/document/address/dpns/tx detail pages + search dispatcher
   ```
4. Update `docs/progress.md`.
5. **Stop. Do not start Stage 3.** Produce a short report to the user covering:
   - What was built.
   - Deviations from the PRD with rationale.
   - Known SDK quirks discovered (any method that's broken / missing / awkward on testnet).
   - What Stage 3 should know.
