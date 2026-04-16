# Stage 3: Browse surfaces & home dashboard

> Stage 3 of 6 in the `native-platform-explorer` build plan.
> **Previous stages:** Stage 1 (shell), Stage 2 (detail pages + search).
> **This stage delivers:** every page that *browses* (the SDK primitives that support pagination and filtering), plus a real home dashboard. After this stage the explorer feels alive.

## Mission

The SDK has only a few real browse primitives — `documents.query` scoped to a contract + document type, `epoch.epochsInfo` / `finalizedInfos` / `evonodesProposedBlocksByRange`, `dpns.usernames`, `voting.votePollsByEndDate`. Build beautiful, filterable UIs on top of every one of them. Then compose a real home dashboard that uses the SDK's live-state queries to give the explorer a first page worth visiting.

## Required reading

- `docs/PRD.md` — sections 5.2 (query table), 7 (Home), 8.4 (documents list), 8.9 (DPNS search), 8.10 (epochs), 8.11 (evonode), and 11.2 (caching).
- `/Users/pasta/workspace/platform/packages/js-evo-sdk/src/documents/facade.ts` — specifically `query()` and its `DocumentsQuery` type (where/orderBy/limit/offset/startAfter and the index constraints enforced by Drive).
- `/Users/pasta/workspace/platform/packages/js-evo-sdk/src/epoch/facade.ts` — `current`, `epochsInfo`, `finalizedInfos`, `evonodesProposedBlocksByRange`, `evonodesProposedBlocksByIds`.
- `/Users/pasta/workspace/platform/packages/js-evo-sdk/src/dpns/facade.ts` — `usernames` query and label prefixing.
- `/Users/pasta/workspace/platform/packages/js-evo-sdk/src/voting/facade.ts` — `votePollsByEndDate`.
- `/Users/pasta/workspace/platform-explorer/packages/frontend/src/components/filters/` — entire folder. Our filter primitives mirror these.
- `/Users/pasta/workspace/platform-explorer/packages/frontend/src/components/charts/` — the D3 line-chart and timeframe menu implementations we draw from.
- `/Users/pasta/workspace/platform-explorer/packages/frontend/src/app/page.js` + `home/Home.js` — for the dashboard layout inspiration.
- `docs/progress.md` — confirm Stages 1–2 complete.

## Assumed state entering this stage

- Stages 1 and 2 committed and marked complete in `docs/progress.md`.
- All detail pages are wired and pass the Stage 2 acceptance criteria.
- SDK query hook infrastructure, `useDpnsAlias`, rate hook, `Identifier`, `CodeBlock`, `CreditsBlock`, breadcrumbs, and search dispatcher already exist.

## Scope — in

### 1. Filter primitives (`src/components/filters/`)

Reusable, typed, URL-synchronised filter widgets driven by `nuqs`. All filter components read and write their state to the URL so every list view is deep-linkable.

- `Filters.tsx` — wrapper that renders a row of child filters + a reset button + an active-filters summary.
- `FilterGroup.tsx` — collapsible group with title, wraps N child filters.
- `InputFilter.tsx` — text input with optional validation (regex / Identifier / bech32m).
- `RangeFilter.tsx` — `min` / `max` numeric pair.
- `DateRangeFilter.tsx` — `from` / `to` date pair with presets (24h / 7d / 30d / custom).
- `MultiSelectFilter.tsx` — `react-select`-style dropdown (build it with Chakra `Menu` + `Checkbox` if you'd rather avoid adding `react-select` here; match the reference explorer's behaviour).
- `ActiveFilters.tsx` — renders current filter values as removable chips.
- `FilterActions.tsx` — Apply / Reset / Clear.
- `MobileFilterMenu.tsx` — a Chakra `Drawer` that hosts the filter column on small screens.

Each filter persists state via `nuqs` parsers (keys namespaced per page).

### 2. Pagination primitives (`src/components/pagination/`)

- `Pagination.tsx` — page-number controls (use `react-paginate` or build with Chakra `HStack` + chevron icons to keep deps minimal).
- `PageSizeSelector.tsx` — dropdown for limit (options 10 / 25 / 50 / 100; clamp at the SDK's server-side max of 100 for document queries).
- `CursorPagination.tsx` — for SDK methods that use `startAfter` (e.g. `documents.query`, `dpns.usernames`, `identities.byNonUniquePublicKeyHash`). Renders "Previous / Next" only; no random-access page numbers. Maintains a cursor stack in component state.

### 3. Chart primitives (`src/components/charts/`)

D3-based, dark-mode-only, responsive. We only build what Stage 3 pages need:

- `LineGraph.tsx` — generic time-series line chart (x: date/number, y: number) with axes, grid, hover tooltip, area fill. Use D3 for scales + path building; let React render the SVG. Responsive via `useWindowSize`.
- `EvonodesLeaderboard.tsx` — horizontal bar chart of `[{ proTxHash, blocksProposed }]`. Top-N with avatars and identifiers.
- `TimeframeMenu.tsx` — 24h / 7d / 30d / custom preset selector (URL-synced).

**No time-series data from the SDK exists.** The `LineGraph` component is used in Stage 3 only for the evonode-proposed-blocks visualisation, which is naturally sequential per epoch. Any other chart in the rest of the project is out of scope (per PRD).

### 4. Document-type browser — `/contract/[id]/documents/[type]/page.tsx`

This is the SDK's **one true list primitive**. Make it excellent.

Behaviour:

- On mount, fetch the contract via `useContract(id)` (already built in Stage 2). Extract the JSON Schema for `documentTypeName = type`.
- From the schema, extract the declared indices (`$indices` in the document type).
- Generate the filter UI dynamically from the indices:
  - For each declared index, render a combined filter for its fields (e.g. `parentNameAndLabel` → two inputs, one for `parentDomainName`, one for `label`).
  - Each filter contributes a `where` clause to the query.
  - **Refuse to submit** if the combined filters don't map to a valid index. When this happens, show a helpful message: "Dash Platform requires queries to match a declared index. Your current filters don't match any index on this document type. Try one of: [list]."
- Order-by selector populated from fields with declared ordering.
- `limit` selector (10 / 25 / 50 / 100; default 25). Server caps at 100.
- Cursor pagination via `startAfter` (use `CursorPagination`).
- Results table: columns are heuristically derived from the schema (show `$id`, `$ownerId`, and the first 2–3 scalar fields). Identifiers link out per Stage 2 conventions.
- URL-synchronised: filter values, `orderBy`, `limit`, `startAfter` all live in the query string so the page is deep-linkable.
- Loading skeletons, empty states, and error cards per Stage 2 conventions.
- Breadcrumbs: `Home › Contract › [short id] › Documents › [type]`.

Create `src/util/schema.ts` with helpers:

- `getIndicesForType(schema, type): Index[]`
- `heuristicColumnsForType(schema, type): { key: string; label: string; kind: 'identifier' | 'scalar' | 'json' }[]`
- `validateWhereAgainstIndices(where, indices): { valid: boolean; matchedIndex?: string; suggestions: Index[] }`

### 5. DPNS search — `/dpns/search/page.tsx`

- Query string `?q=<prefix>` drives the search.
- Fires `sdk.dpns.usernames({ labelPrefix: q, limit: 20 })` with cursor pagination (`startAfter`).
- Each row: `name` (link to `/dpns/[name]`), owner identity (with avatar + DPNS alias from Stage 2).
- Filters: prefix input (already the primary), optional owner-identity filter if the SDK supports it (check `DpnsUsernamesQuery` type).

### 6. Epoch pages

#### 6a. `/epoch/page.tsx` (current)

SDK:
- `epoch.current()` — current epoch header.
- `epoch.evonodesProposedBlocksByRange({ epoch: current.index, limit: 100, order: 'desc' })` — leaderboard.

Render:
- `EpochHeaderCard` — epoch index, start / end timestamps, progress bar (reuse `EpochProgress` from ref explorer's pattern), minutes-to-next.
- `EvonodesLeaderboard` — top-N bar chart.
- Below the chart, a paginated table of all evonodes + block counts, with identifiers linking to `/evonode/[proTxHash]` (Stage 3 target, implemented below).

#### 6b. `/epoch/[index]/page.tsx` (historical)

SDK:
- `epoch.epochsInfo({ startIndex: idx, endIndex: idx })`
- `epoch.finalizedInfos({ startIndex: idx, endIndex: idx })`
- `epoch.evonodesProposedBlocksByRange({ epoch: idx, limit: 100, order: 'desc' })`

Same layout as `/epoch` but with the epoch selected frozen.

Breadcrumbs: `Home › Epoch › [index]`.

#### 6c. `/epoch/history/page.tsx`

- URL-driven range: `?from=X&to=Y` (default: last 20 epochs).
- `epoch.epochsInfo({ startIndex: from, endIndex: to })`.
- Paginated table: epoch index, start, end, duration, block count, proposer count, "View →" link.
- `TimeframeMenu` + explicit range inputs.

### 7. Evonode detail — `/evonode/[proTxHash]/page.tsx`

SDK:
- `epoch.current()` (for default selector).
- `epoch.evonodesProposedBlocksByIds(epoch, [proTxHash])` — current epoch by default.
- `protocol.versionUpgradeVoteStatus(undefined, 100)` paginated — **scan the returned entries client-side** for this proTxHash and render the vote status if found.
- Derive the node's Platform identity (pro_tx_hash base64-encoded → identifier, per the reference explorer's convention) and try `identities.fetch(derivedId)` to optionally show DPNS alias / balance / key count.

Render:
- Header: proTxHash Identifier, derived identity Identifier (+ DPNS alias).
- Epoch selector that re-fires `evonodesProposedBlocksByIds` for the chosen epoch index.
- Blocks-proposed stat card for the selected epoch.
- Small card: protocol upgrade vote (if found).
- "View in L1 explorer" external link (build URL from the selected network's `l1ExplorerBaseUrl`).

### 8. Contract history tab (upgrade from Stage 2 placeholder)

On `/contract/[id]`, replace the Stage-2 "list of versions" with:

- `contracts.getHistory({ dataContractId: id })` already fires lazily.
- Render a vertical timeline (version number + timestamp + "View schema" / "View diff" buttons).
- Diff view (`src/components/contract/SchemaDiff.tsx`): given two DataContract schemas, render a JSON-diff (lines added / removed / changed, colored, scrollable). Use a minimal local diff algorithm or a small dependency (`jsondiffpatch` is acceptable if it adds <50kb; otherwise hand-roll a simple recursive diff). Color-code per theme (success green for additions, danger red for deletions, warning yellow for changes).

### 9. Home dashboard — `/page.tsx`

Rebuild from Stage 1's placeholder. Layout (match reference explorer's `Home`):

- **Intro** section: tagline, network + trusted-mode badge, large centered `GlobalSearchInput`.
- **Network cards row** (Chakra responsive grid):
  - Block height — `system.status`.
  - Current epoch — `epoch.current` with a compact progress bar and click-through to `/epoch`.
  - Total credits — `system.totalCreditsInPlatform` (CreditsBlock with large value).
  - Protocol version — `protocol.versionUpgradeState` (current version; if an upgrade is pending, highlight the activation height in `warning` yellow).
  - Active quorums — `system.currentQuorumsInfo` (count + type breakdown).
- **Current-epoch top proposers** — `EvonodesLeaderboard` top 20 from `epoch.evonodesProposedBlocksByRange`.
- **Vote polls ending soon** — `voting.votePollsByEndDate({ dateRange: { start: now, end: now + 30d } })`, limit 10. Each row links to the relevant contested-resource detail (Stage 4 target — link will render; destination still placeholder).
- **Well-known contracts grid** — cards for each entry in `src/constants/well-known.ts` with `kind: 'contract'`. Hovering prefetches `contracts.fetch(id)` and shows a tooltip with the friendly name + owner.
- **Quick actions panel** — four buttons that focus the search input with placeholder text:
  - "Look up identity by ID"
  - "Resolve a DPNS name"
  - "Check a token"
  - "Check an epoch"

### 10. Loading & perf polish

- All lists lazy-load images (minidenticon avatars generate client-side — OK as is).
- Every heavy page wraps its tabs in `Suspense` with skeleton fallbacks.
- Use `React Query`'s `prefetchQuery` on navbar hover for the home dashboard's most expensive queries.
- Ensure `LineGraph` re-renders are debounced (resize events hit `useWindowSize`; debounce 150ms).

## Scope — out (do NOT build in this stage)

- No governance / groups / protocol / network pages — those are Stage 4.
- No proof-verification UI — Stage 5.
- No wallet / broadcast — Stage 6.
- No token holders UX on `/token/[id]/holders` — leave Stage-2 placeholder, Stage 4 target.
- No real `SchemaTree` (left sidebar navigator) — the flat Document-types list from Stage 2 stays.

## Acceptance criteria

- [ ] `/contract/[id]/documents/[type]` renders a real, paginated, filterable document list against a known testnet contract (e.g. DPNS `domain`).
- [ ] Submitting filters that don't map to a valid index surfaces the helpful error with a list of valid indices.
- [ ] `orderBy`, `limit`, and `startAfter` are reflected in the URL.
- [ ] `/dpns/search?q=al` returns usernames starting with `al` (on testnet).
- [ ] `/epoch` renders the current epoch, a progress bar, and a working evonode leaderboard chart.
- [ ] `/epoch/[index]` renders a historical epoch by index with the same layout.
- [ ] `/epoch/history` renders a paginated range table.
- [ ] `/evonode/[proTxHash]` renders block counts for a selectable epoch and (if available) the node's upgrade-vote status.
- [ ] The Contract `History` tab shows a timeline with a working diff view between any two adjacent versions.
- [ ] The home dashboard renders five network cards with live data, the evonode leaderboard, upcoming polls, and a well-known contracts grid.
- [ ] Clicking a chart bar / table row navigates to the associated detail page.
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` all pass.
- [ ] New unit tests: `schema.ts` helpers (index validation happy/sad paths), diff algorithm if handwritten, filter-URL-sync round-trip.
- [ ] Playwright: extend smoke test to navigate from `/` → `/contract/GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec/documents/domain` and assert at least one row renders (skip gracefully if DAPI is unreachable).

## Testing

- Unit: `schema.ts`, diff, filter URL sync, LineGraph utilities (scale / tick calc).
- Component: `CursorPagination`, `DateRangeFilter`, `EvonodesLeaderboard`.
- E2E: smoke test expansion above.

## When complete

1. Full lint/typecheck/test/build clean.
2. Manual smoke test of every new page against testnet.
3. Stage files explicitly; commit:
   ```
   feat(browse): document browser, epochs, evonodes, dpns search, live home dashboard
   ```
4. Update `docs/progress.md`.
5. **Stop. Do not start Stage 4.** Produce a short report to the user: what shipped, deviations, and anything Stage 4 should know — especially about how the SDK represents vote polls and contested-resource paths (since Stage 4 picks those up).
