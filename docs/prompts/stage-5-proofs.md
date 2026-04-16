# Stage 5: Proof verification UX

> Stage 5 of 6 in the `native-platform-explorer` build plan.
> **Previous stages:** Stages 1–4 cover the shell, detail pages, browse surfaces + home, and governance/groups/network.
> **This stage delivers:** the explorer's single biggest differentiator from `platform-explorer` — proof-state UX threaded through every page, plus a diagnostics drawer and clear opt-outs.

## Mission

Stages 1–4 use the SDK's `…WithProof()` variants under the hood (trusted mode is the default). What they lack is any **visible, honest signal** to the user about whether the data they're looking at came with a verified proof, didn't, or failed. This stage makes proof-state a first-class UI citizen.

By the end of Stage 5, the explorer clearly answers, for every value on the screen:

1. Was this fetched with a proof?
2. Was the proof verified in this browser?
3. If not, why? (untrusted mode / no proof variant available / verification failed).

Users also get a "Diagnostics" drawer (⌘/ or Ctrl+/) exposing the raw timing, endpoint, and proof state of every query on the current page.

## Required reading

- `docs/PRD.md` — sections 5.4 (trusted vs untrusted), 9.7 (proof-state chip), 11.7 (error handling including proof failures), 16 (Known limitations — proof coverage gaps).
- `/Users/pasta/workspace/platform/packages/js-evo-sdk/src/sdk.ts` — `EvoSDKOptions.proofs`, trusted/untrusted factory methods, log level.
- Any SDK file that defines `*WithProof` methods (spread across `identities/`, `contracts/`, `documents/`, `tokens/`, `epoch/`, `system/`, `protocol/`, `voting/`, `group/`, `addresses/`, `dpns/`). Build a mental inventory: for every query hook in `src/sdk/hooks.ts`, note whether the underlying SDK method has a proof sibling.
- `/Users/pasta/workspace/platform/packages/wasm-sdk/` — skim only to understand how proofs are verified in the browser (so you can write the /about explanation correctly).
- Stage 4's report — it should flag any facades that lack proof variants.
- `docs/progress.md` — confirm Stages 1–4 complete.

## Assumed state entering this stage

- Stages 1–4 committed, in `docs/progress.md`.
- `SdkProvider` already exposes `trusted: boolean` and `setTrusted(t)`.
- Most existing query hooks already call `*WithProof()` where available (confirm this; fix if not).

## Scope — in

### 1. Proof-state primitives

Establish a canonical model:

```ts
export type ProofState =
  | { kind: 'verified'; verifiedAt: number }                      // Green check
  | { kind: 'unverified-in-flight' }                              // Neutral, short-lived
  | { kind: 'unverified-no-variant'; reason: 'no-proof-method' }  // Gray, honest
  | { kind: 'unverified-trusted-off'; reason: 'trusted-mode-off' } // Gray, user choice
  | { kind: 'failed'; error: string }                              // Red
  | { kind: 'unknown' };                                           // Neutral, startup
```

File: `src/sdk/proofs.ts`.

Expose helpers:

- `classifyProof(query, options): ProofState` — derives the state from the React Query result + hook metadata.
- `aggregateProof(states: ProofState[]): ProofState` — reduces many queries into a single page-level state. Worst state wins (`failed` > `unverified` > `verified`).

### 2. `useSdkQuery` upgrade

Every query hook in `src/sdk/hooks.ts` must surface its proof state. Refactor:

- `useSdkQuery(key, fn, { proofVariant?: boolean })`:
  - If `proofVariant` is `true` and trusted mode is on, call the `…WithProof()` function.
  - Tracks whether a proof variant was available.
  - Returns a conventional `UseQueryResult` plus an extra field `proofState: ProofState`.
- Hooks become e.g. `useIdentity(id) -> { ...queryResult, proofState }`.
- Update every call site across Stages 2–4. This is the single largest mechanical change in Stage 5 — do it with care, commit by facade if helpful.

### 3. `ProofChip` component

`src/components/data/ProofChip.tsx`:

- Tiny pill rendered inline next to values.
- Icons:
  - `verified` → success-green check.
  - `unverified-no-variant` / `unverified-trusted-off` → gray info.
  - `unverified-in-flight` → neutral spinner.
  - `failed` → danger-red ×.
  - `unknown` → transparent placeholder.
- Tooltip on hover: human-readable explanation. Click reveals detail in the Diagnostics drawer (see §7).
- Accepts `proofState: ProofState` + optional `size: 'xs' | 'sm'`.
- Accessible: `role="status"`, `aria-label` based on state.

### 4. `ProofFailureBanner` component

`src/components/data/ProofFailureBanner.tsx`:

- Danger-red card rendered at the top of a detail page when *any* of its queries returns `proofState.kind === 'failed'`.
- Copy: "One or more values on this page failed proof verification. The data shown is unverified."
- Actions:
  - "Retry with proofs" → invalidates the affected queries.
  - "View unverified" → temporarily switches the affected queries to untrusted mode for the duration of this session on this page. Does **not** change the global setting.
  - "Open diagnostics" → opens the drawer scrolled to the failing query.
- Dismissible (but with a persistent small icon in the page header reminder).

### 5. Page-level proof indicator

Every detail page (identity, contract, token, document, address, DPNS, epoch, evonode, governance detail, network pages) should:

- Collect the `proofState` of its top-level queries.
- Reduce them via `aggregateProof`.
- Render a small `ProofChip` in or next to the DigestCard header — "All values on this page are proof-verified" when `verified`, etc.

Add a layout-level indicator in the navbar that summarises proof state across *all* queries currently alive in React Query's cache (optional; if it's noisy, keep it to per-page).

### 6. Settings page becomes real — `/settings/page.tsx`

- Sections:
  - **Network** — mainnet / testnet radio + DAPI endpoint list (comma-separated). "Test connection" button that re-runs `sdk.connect()`.
  - **Trusted mode** — toggle. Prominent explanation: "When on, every query requests a Merkle proof and verifies it in your browser. Off = faster, unverified." Disabling prompts a confirmation modal.
  - **Proof behavior on failure** — radio: "Stop and show error" (default) / "Fall back to unverified with warning".
  - **Connection settings** — `connectTimeoutMs`, `timeoutMs`, `retries`, `banFailedAddress` (from `EvoSDKOptions.settings`).
  - **Well-known registry** — table listing entries with "Add / Remove" buttons. Persists to `localStorage` at `npe:well-known-overrides`. On load, `useWellKnownName` merges overrides on top of the bundled JSON.
  - **Diagnostics log** — toggle for keeping the session log of raw SDK calls (see §7).
- All settings persist to `localStorage`.

### 7. Diagnostics drawer

- `src/components/diagnostics/DiagnosticsDrawer.tsx` — Chakra `Drawer` from the right edge, summoned by keyboard shortcut (`⌘/` on macOS, `Ctrl+/` elsewhere — handle both) and via a navbar icon button.
- Contents:
  - Current SDK state: network, trusted flag, connected-endpoint URL (from the SDK's exposed state), SDK version, protocol version.
  - Table of the last N (default 100) SDK queries made during this session:
    - Query key, facade, method, args (truncated).
    - Duration (ms).
    - Proof state (using `ProofChip`).
    - Error (if any), expandable.
  - "Clear log" + "Copy JSON" buttons.
- Implementation: a small in-memory ring buffer maintained by a React Query `QueryCache` subscriber (`queryClient.getQueryCache().subscribe(...)`), tagged with the hook's metadata (facade, method, proofVariant flag).
- Drawer is hidden unless diagnostics toggle in `/settings` is on. (Shortcut opens it even when the log is empty — users can always inspect SDK state.)

### 8. Untrusted-mode visible indicator

- When `trusted === false`, the entire navbar gets a subtle warning-yellow left border / bar and the "Network" badge says "Untrusted mode". Matching footer indicator.
- The home page surfaces a dismissible banner: "Untrusted mode is on — data on this site is not cryptographically verified in your browser. [Turn on trusted mode]".

### 9. `/about` page content

Convert `/about/page.tsx` from Stage 1 placeholder into a real, markdown-rendered explainer. Sections:

- **What this is** — two paragraphs linking to the PRD.
- **How it works** — short diagram (reuse or reword PRD §3), emphasising no-backend.
- **Proofs** — explain trusted mode: what a quorum public key is, what "verified in your browser" means, why some queries have no proof variant, what a failure means.
- **Enumeration** (with anchor `#enumeration`) — explain why there's no "browse all identities / all contracts / all tokens". This is the link target from `/token/[id]/holders` (Stage 4).
- **Privacy** — direct-to-DAPI, no analytics, no telemetry.
- **Credits** — link to `dashevo/platform`, `@dashevo/evo-sdk`, `platform-explorer`.

Render via `react-markdown` + `remark-gfm`. Source file: `src/content/about.md`.

### 10. `/sdk-reference` page

- Autogenerated-feeling reference: for every route in the explorer, list the exact SDK calls that power it (the table in PRD §18).
- Source: a hand-maintained JSON structure at `src/content/sdk-reference.json` that the page renders as a big table. Keep it in sync with reality — if Stage 6 adds routes, they show up here.
- Each cell links to the SDK docs when possible (the evo-sdk's `src/<facade>/facade.ts` on GitHub).

## Scope — out

- No wallet / broadcast UI (Stage 6).
- No protocol-upgrade voting itself — that's a masternode operator action, not a UI feature.
- No attempt to verify proofs we receive differently from how the SDK already does — the WASM SDK is the proof engine; we only surface its results.

## Acceptance criteria

- [ ] Every hook in `src/sdk/hooks.ts` returns `{ ...queryResult, proofState }`. Compile-time-enforced via the generic hook signature.
- [ ] On every detail page, a `ProofChip` is visible near the DigestCard header; hovering it explains the page's aggregate proof state.
- [ ] Toggling trusted mode off in `/settings`:
  - switches every future query to the non-proof variant;
  - paints the navbar warning;
  - surfaces the home-page "Untrusted mode" banner;
  - `ProofChip` shows gray `unverified-trusted-off` everywhere; tooltips explain why.
- [ ] Simulated proof failure (easiest way: point DAPI at a wrong endpoint in `/settings` and re-fetch) surfaces a `ProofFailureBanner` with working Retry / View unverified / Open diagnostics actions.
- [ ] `⌘/` (Mac) and `Ctrl+/` (Win/Linux) open the Diagnostics drawer. The drawer shows recent SDK calls with accurate facade/method/proof/duration data.
- [ ] `/settings` persists every setting across reload. Adding a well-known override shows up immediately in the home page's well-known grid.
- [ ] `/about` renders the full explainer. Navigating to `/about#enumeration` scrolls to the right anchor.
- [ ] `/sdk-reference` lists every route and its SDK calls, matching reality.
- [ ] No existing behaviour from Stages 2–4 is regressed (run the accumulated Playwright suite).
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` all pass.

## Testing

- Unit: `classifyProof` truth table, `aggregateProof` (every pairwise reduction).
- Component: `ProofChip` renders each state correctly; `ProofFailureBanner` actions fire the right query invalidations; `DiagnosticsDrawer` keyboard shortcut toggles on both platforms (`userAgent` not required; the component should bind both `⌘/` and `Ctrl+/`).
- E2E: one Playwright test that flips trusted mode off, reloads `/identity/[testnet-id]`, asserts the navbar warning bar is visible and `ProofChip` on the page shows the `unverified-trusted-off` state.

## When complete

1. Full lint/typecheck/test/build clean.
2. Manually: walk every major page (from Stages 2–4) with trusted mode on and confirm every `ProofChip` reports `verified` where the SDK supports it and the documented, honest state where it doesn't.
3. Stage files and commit (feel free to break into several commits — "feat(proofs): ProofState primitives + chip + banner", "refactor(hooks): thread ProofState through every SDK hook", "feat(proofs): settings + diagnostics drawer + about page").
4. Update `docs/progress.md`.
5. **Stop. Do not start Stage 6.** Produce a report: what shipped, which SDK methods lack proof variants (we surface them as `unverified-no-variant`), and any issues found during the thread-through.
