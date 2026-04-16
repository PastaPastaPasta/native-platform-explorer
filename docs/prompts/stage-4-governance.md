# Stage 4: Governance, groups, protocol, network

> Stage 4 of 6 in the `native-platform-explorer` build plan.
> **Previous stages:** Stage 1 (shell), Stage 2 (detail pages), Stage 3 (browse surfaces + home).
> **This stage delivers:** contested resources, vote polls, groups, protocol upgrade state, and the full `/network/*` suite. After this stage the entire read surface of the PRD is covered.

## Mission

Finish the read-only explorer. Implement every remaining page that uses the SDK's `voting`, `group`, `protocol`, and `system` facades. Also build the honest, "seeded-list" UX for token holders that the PRD calls for (§8.6.1) — this is the place it best fits, alongside the other scoped-list patterns we touch here.

## Required reading

- `docs/PRD.md` — sections 8.6.1 (seeded token holders), 8.12–8.17 (governance, groups, network, prefunded, state-transition).
- `/Users/pasta/workspace/platform/packages/js-evo-sdk/src/voting/facade.ts`
- `/Users/pasta/workspace/platform/packages/js-evo-sdk/src/group/facade.ts`
- `/Users/pasta/workspace/platform/packages/js-evo-sdk/src/protocol/facade.ts`
- `/Users/pasta/workspace/platform/packages/js-evo-sdk/src/system/facade.ts`
- Reference explorer (for styling + structure, not data — our backend is fundamentally different):
  - `packages/frontend/src/app/contestedResources/`, `contestedResource/[resourceValue]/`, `masternodeVotes/`, `validators/`
  - `packages/frontend/src/components/contestedResources/`
  - `packages/frontend/src/components/validators/`
- Stage 3 report (whatever the previous agent noted about vote-poll shape and contested-resource path encoding).
- `docs/progress.md` — confirm Stages 1–3 complete.

## Assumed state entering this stage

- Stages 1–3 committed and marked complete.
- Filter + pagination + chart primitives from Stage 3 exist.
- `useSdkQuery` hook style is well-established.

## Scope — in

### 1. Governance pages

#### 1a. `/governance/contested/page.tsx`

The SDK requires a **contract scope** for `group.contestedResources`. UX:

- Top of page: contract selector. Default populated with well-known contracts tagged with `kind: 'contract'` that have `hasContestedResources: true` in the registry (you may need to add this flag — extend `src/constants/well-known.ts`). At minimum seed DPNS.
- User can also enter a custom contract ID → fetch via `contracts.fetch(id)` to confirm it exists.
- Once a contract is chosen, require a `documentTypeName` picker (derived from the contract schema).
- Fire `group.contestedResources({ contractId, documentTypeName })` (use the real query type from the SDK — check `VotePollsByDocumentTypeQuery`).
- Render results as a paginated list. Each row shows the encoded resource value (decoded into human-readable form where possible — e.g. for DPNS `domain`, decode `["dash", label]`), the index name, and a "View" link.
- Deep-link URL: `/governance/contested?contract=<id>&docType=<name>`.

#### 1b. `/governance/contested/[...slug]/page.tsx`

The slug encodes: `contractId / docType / indexName / indexValuesB64`.

- Read these segments (they all come as URL-safe strings).
- Fire `voting.contestedResourceVoteState({ contractId, documentTypeName, indexName, indexValues, resultType: 'Documents' })` (or whichever result type the SDK's type signature specifies).
- Render:
  - Header card with the decoded resource value + index name + document type + contract Identifier.
  - Vote tally bar (`VoteTallyBar`, new): horizontal stacked bar for `towardsIdentity / abstain / lock` with absolute counts and percentages.
  - Contenders list: one card per contender identity, showing pre-funded balance, winner badge if resolved, and the resource document owner preview (via `identities.fetch` for the contender's `towardsIdentity`).
  - Deadline + status pill (active / closed).
- Voters tab: for each contender, call `group.contestedResourceVotersForIdentity({ contractId, documentTypeName, indexName, indexValues, contestantId })` to enumerate voters. Paginate via `startAfter`. Each voter row = voter identity (with alias) + choice badge + link to their `/identity/[id]`.

#### 1c. `/governance/polls/page.tsx`

- Filters: date range (`DateRangeFilter`), limit.
- Fires `voting.votePollsByEndDate({ startDate, endDate, limit })`.
- Each row = poll metadata (contract, doc type, index name, index values decoded if possible, end date, status). "View" links to the matching `/governance/contested/...` detail.
- Deep-linked via URL.

### 2. Groups pages

#### 2a. `/groups/[contractId]/page.tsx`

- `group.infos({ dataContractId })` — paginated by position.
- Render a table: position, member count (from `members.size` if available — if not, defer to the detail page), threshold (if present in the returned `Group` type). Each row links to `/groups/[contractId]/[position]`.
- Header shows the contract Identifier + friendly name via `useWellKnownName`.

#### 2b. `/groups/[contractId]/[position]/page.tsx`

SDK calls:
- `group.info(contractId, position)` — core group info.
- `group.members({ contractId, groupContractPosition: position })` — map of identity → power.
- `group.actions({ contractId, groupContractPosition: position })` lazy on Actions tab.
- `group.actionSigners({ contractId, groupContractPosition: position, actionId })` lazy on row expansion.

Render:
- Header card with contract Identifier, position, name if present in the group type, required threshold.
- Tabs: **Members** · **Actions**.
  - **Members**: table — identity (Identifier + alias) + power. Sort by power desc by default.
  - **Actions**: paginated list of group actions (proposals). Each row expands to show the signers (via `actionSigners`), action type, payload (CodeBlock).

### 3. Protocol & network pages

#### 3a. `/network/protocol/page.tsx`

- `protocol.versionUpgradeState()` — render current + pending version, activation height, status.
- `protocol.versionUpgradeVoteStatus(startProTxHash, count)` — paginated (cursor via `startProTxHash`).
- Render:
  - Summary card with current version, pending version, activation block height, time-to-activation (if known).
  - **Vote progress bar**: horizontal stacked bar — `accepted / abstained / rejected / unvoted` with counts + percentages. Use the same `VoteTallyBar` component from §1b, with a `variant="protocol"` style.
  - Paginated table of per-masternode vote status (proTxHash + vote) with Identifier components. Cursor paginated via `startProTxHash` from the last row.

#### 3b. `/network/status/page.tsx`

- `system.status()` — version, network, chainId, latest block height + timestamp, app version.
- `system.currentQuorumsInfo()` — summary.
- Render as a stack of `InfoCard`s with the key/value rows.
- Include an "Uptime" style card: time since latest block (relative to now, updating every second via a lightweight interval in a `useEffect`).

#### 3c. `/network/quorums/page.tsx`

- `system.currentQuorumsInfo()` — render one card per active quorum: quorum hash, type, size, threshold. Add a copy-all-hashes affordance.

#### 3d. `/network/credits/page.tsx`

- `system.totalCreditsInPlatform()` rendered large at the top (CreditsBlock).
- A form to look up a prefunded specialized balance for an identity: input field for identity ID → `system.prefundedSpecializedBalance(id)` → render the returned balance struct.
- Rate (DASH/USD) from `useDashUsdRate` for context.

### 4. Token holders (seeded) — `/token/[id]/holders/page.tsx`

The SDK has no holders enumeration. Build the honest, seeded-list UX per PRD §8.6.1.

- Input area:
  - Textarea that accepts newline-/comma-separated identity IDs or DPNS names.
  - "Add viewed identities" button that loads any identity IDs the user has visited in this session (from a small localStorage log — see §5 below).
  - "Add well-known" button to splat every `kind: 'identity'` entry from the registry.
- "Resolve & query" button:
  - Validates each line (if a line is a DPNS name, resolve via `dpns.resolveName`; if it looks like a base58 identifier, take as-is; otherwise flag as invalid).
  - Calls `sdk.tokens.balances(resolvedIds, tokenId)` once.
- Results table: identity (Identifier + alias) + balance (formatted by the token's decimals, obtained from the token's parent contract).
- Clear, inline disclaimer: "Dash Platform does not publish a holder index. This list contains only the identities you've provided. To see more, add their IDs above." Link to `/about#enumeration`.

### 5. Session-viewed identities log

- `src/util/session.ts` — tiny localStorage-backed store of the last 50 unique identity IDs visited on `/identity/[id]`.
- Opt-in (prompt once on first visit to `/identity/[id]`): a small banner "Remember identities you've viewed? (helps seed holder lookups)". If dismissed or declined, the log stays empty.
- Pages can read the log via `useViewedIdentities()`.

### 6. Shared components

- `src/components/governance/VoteTallyBar.tsx` — stacked horizontal bar with configurable categories + colors (reuses brand palette; success for "for", warning for "abstain", danger for "lock" / "rejected"). Supports a `variant` prop (`'contested'` vs `'protocol'`).
- `src/components/governance/ContenderCard.tsx` — card for a single contender in a contested-resource detail.
- `src/components/governance/VoteChoiceBadge.tsx` — small pill for a single vote choice.
- `src/components/network/QuorumCard.tsx` — one active quorum.
- `src/components/token/SeededHoldersForm.tsx` — the textarea + resolve + query flow from §4.

### 7. Identity page: upgrade Tokens & Votes & Groups tabs

The Stage 2 placeholders become real:

- **Tokens tab on `/identity/[id]`**: merge the viewed-identities-token-lookup + well-known-token balances. Include a tiny form to append ad-hoc token IDs. Use `tokens.identityBalances(identityId, [tokenIds])` with whatever token IDs are currently in-scope; enrich with token names from `tokens.contractInfo` lazily.
- **Groups tab**: `group.identityGroups({ identityId })` (already fired in Stage 2) now actually renders the list of `(contractId, position)` with links to the relevant group detail pages.
- **Votes tab**: `voting.contestedResourceIdentityVotes({ identityId })` renders a table: resource (link to contested detail) + choice (VoteChoiceBadge).

## Scope — out (do NOT build in this stage)

- No proof-verification UI (Stage 5).
- No wallet / broadcast (Stage 6).
- No new chart types beyond what Stage 3 built — the stacked vote-tally bars are pure HTML/CSS, not D3.
- No custom editor for the well-known registry beyond in-code edits (Stage 6 adds a settings screen).

## Acceptance criteria

- [ ] `/governance/contested` lets the user pick DPNS → `domain` and lists active contested resources.
- [ ] Clicking a contested resource opens `/governance/contested/[slug]` with real vote tally bars + contender cards + voters list (paginated).
- [ ] `/governance/polls` renders upcoming polls with working date-range filtering.
- [ ] `/groups/[contractId]` and `/groups/[contractId]/[position]` render groups against a contract that has groups defined (use a known testnet contract if possible; otherwise DPNS if applicable — check with the SDK).
- [ ] `/network/protocol` shows upgrade state + paginated per-masternode vote table with cursor pagination.
- [ ] `/network/status`, `/network/quorums`, `/network/credits` all render live data.
- [ ] `/token/[id]/holders` renders the seeded-list UX, correctly resolves DPNS inputs, and batch-queries balances.
- [ ] Identity `/identity/[id]` Tokens / Groups / Votes tabs now show real data.
- [ ] Every governance/group/network route has correct breadcrumbs and deep-linked URL state.
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` all pass.
- [ ] New unit tests cover: `VoteTallyBar` math (percentages + rounding), seeded-holders input parser (DPNS name vs identifier disambiguation + invalid lines), session-viewed-identities log (LRU trim to 50).
- [ ] Playwright: extend smoke test to navigate from `/` → `/network/status` and assert current-height card renders.

## Testing

- Unit tests as listed above.
- Component test: `SeededHoldersForm` flow — pastes a mix of DPNS + identifiers, validates, resolves.
- E2E expansion per acceptance criteria.

## When complete

1. Full lint/typecheck/test/build clean.
2. Manual smoke test of every new page.
3. Stage files explicitly and commit:
   ```
   feat(governance): contested resources, polls, groups, protocol upgrade, network + seeded holders
   ```
4. Update `docs/progress.md`.
5. **Stop. Do not start Stage 5.** Produce a short report to the user — what shipped, deviations, and flag anything about proof verification that became obvious while building governance (e.g. endpoints where the SDK's proof variant is missing or awkward). Stage 5 will need that.
