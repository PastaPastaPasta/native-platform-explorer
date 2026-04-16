# Stage 1: Foundation

> Stage 1 of 6 in the `native-platform-explorer` build plan.
> **Previous stage:** none — repo currently contains only `README.md`, `LICENSE`, `.gitignore`, and the `docs/` folder.
> **This stage delivers:** a beautiful, empty Next.js shell that talks to the evo-sdk, is themed to match platform-explorer, and is ready for feature work.

## Mission

You are building `native-platform-explorer` — a client-only Dash Platform block explorer. The entire project lives at `/Users/pasta/workspace/native-platform-explorer`. Work inside that directory. Do not touch anything outside of it.

Stage 1's job is to build the **chassis**: Next.js 14 App Router with static export, a design system ported from the reference explorer, an SDK provider wired up to `@dashevo/evo-sdk`, navigation, empty placeholder pages for every route in the PRD, CI, and linting. **No business logic, no real data rendering yet.**

By the end of Stage 1 the app must:

1. `pnpm dev` launches Next.js and serves a themed home page.
2. `pnpm build` produces a static `out/` directory.
3. The SDK successfully connects to testnet on first page load (visible in the navbar's NetworkStatus).
4. Every route defined in the PRD returns an empty, themed page with correct breadcrumbs and page title (no 404s for planned routes).
5. Lint + typecheck + unit tests pass cleanly in CI.

## Required reading

Read these files in full **before writing any code**:

- `docs/PRD.md` (this repo) — especially sections 3 (Architecture), 4 (Tech Stack), 6 (Routes), 9 (Visual & Design System), 11 (Cross-cutting concerns), 12 (File Structure), 15 (Build & Deployment).
- `/Users/pasta/workspace/platform/packages/js-evo-sdk/README.md`
- `/Users/pasta/workspace/platform/packages/js-evo-sdk/src/sdk.ts` — look at `EvoSDK`, `ConnectionOptions`, factory methods, `connect()`.
- `/Users/pasta/workspace/platform-explorer/packages/frontend/package.json` — mirror its approach to React Query, Chakra, nuqs, fonts.
- `/Users/pasta/workspace/platform-explorer/packages/frontend/src/app/layout.js` + `Providers.js` — understand the provider stack we're cloning.
- `/Users/pasta/workspace/platform-explorer/packages/frontend/src/components/layout/RootComponent.js` + `navbar/` + `footer/` — we mirror these structurally.
- `/Users/pasta/workspace/platform-explorer/packages/frontend/src/styles/` — the theme we're porting. Specifically read `theme.js`, `colors.js`, `global.scss`, and any `mixins.scss` files.
- `/Users/pasta/workspace/platform-explorer/packages/frontend/src/components/ui/` — get a feel for the UI primitives. We don't re-implement them here — placeholder components are fine — but we'll want them later.

## Assumed state entering this stage

- `/Users/pasta/workspace/native-platform-explorer/` exists and contains only `README.md`, `LICENSE`, `.gitignore`, `docs/PRD.md`, `docs/prompts/`.
- `.git` is initialised on branch `main` with no commits yet. Your first act should be to make the initial commit after scaffolding.
- Node 20+ is available. `pnpm` is the preferred package manager (but `npm` or `yarn` are acceptable if pnpm fails; document what you chose).

## Scope — in

### 1. Next.js project setup

- Initialise a Next.js 14 TypeScript project **in place** inside `/Users/pasta/workspace/native-platform-explorer/` (don't create a nested subdirectory).
- App Router (`src/app/` layout).
- `next.config.mjs` with:
  - `output: 'export'` (static export mandatory).
  - `sassOptions.includePaths = [path.join(__dirname, 'src/styles')]`.
  - Webpack config to support importing markdown files as raw (we'll need this in Stage 5/6). Use `raw-loader` or Next's `asset/source` module type.
  - Asset prefix for the WASM blob (see §12 of the PRD and the SDK's webpack config).
- `tsconfig.json` in strict mode (`"strict": true`, `"noUncheckedIndexedAccess": true`) with path aliases matching the PRD:
  - `@/*` → `./src/*`
  - `@components/*` → `./src/components/*`
  - `@ui/*` → `./src/components/ui/*`
  - `@sdk/*` → `./src/sdk/*`
  - `@util/*` → `./src/util/*`
  - `@hooks/*` → `./src/hooks/*`
  - `@styles/*` → `./src/styles/*`
  - `@constants/*` → `./src/constants/*`
  - `@enums/*` → `./src/enums/*`
- `.nvmrc` pinning Node (20.x).

### 2. Dependencies

Install these. Exact versions should be the latest-compatible at install time; major versions are what matter.

**Runtime:**
- `next` ^14.2
- `react` ^18.2, `react-dom` ^18.2
- `@chakra-ui/react` ^2.8, `@emotion/react` ^11, `@emotion/styled` ^11, `framer-motion` ^12
- `@tanstack/react-query` ^5
- `@tanstack/react-table` ^8
- `nuqs` ^2
- `@dashevo/evo-sdk` (install from the platform repo workspace path: `"@dashevo/evo-sdk": "file:/Users/pasta/workspace/platform/packages/js-evo-sdk"`). If that doesn't resolve cleanly (unbuilt workspace), fall back to `"@dashevo/evo-sdk": "^3.1.0-dev.1"` from npm and document the choice in the stage report.
- `d3` ^7 (stub usage only — no charts yet)
- `minidenticons` ^4
- `sass` ^1.69
- `bignumber.js` ^9 (we'll need it for credits math)

**Dev:**
- `typescript` ^5
- `@types/react`, `@types/react-dom`, `@types/node`, `@types/d3`
- `eslint` ^8, `eslint-config-next`, `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`
- `prettier` ^3
- `vitest` ^1, `@vitest/ui`, `@testing-library/react` ^16, `@testing-library/jest-dom` ^6, `happy-dom` ^14
- `@playwright/test` ^1 (installed, but tests are empty in stage 1)

### 3. Fonts & theme

- Use `next/font/google` to load Montserrat (weights 400, 600, 700), Open Sans (400, 600), Roboto Mono (400, 500). Expose them via CSS variables `--font-heading`, `--font-body`, `--font-mono`. See `src/styles/fonts.ts` in §12 of the PRD.
- Implement `src/styles/theme.ts` using Chakra's `extendTheme`. Colors, spacing, radii, breakpoints must match PRD §9.1–9.3.
  - `colors.brand.{normal,light,deep,shaded,pressed}`, `colors.success`, `colors.danger`, `colors.warning`, `colors.orange`, and the full `gray-100..gray-900` scale from PRD §9.1.
  - `radii.block = '30px'`.
  - Container `maxWidth = '1310px'`.
  - Breakpoints: `sm 30em, md 48em, lg 62em, xl 80em, '2xl' 96em, '3xl' 120em`.
  - Set `initialColorMode: 'dark'`, `useSystemColorMode: false`.
- Port these SCSS mixins from `/Users/pasta/workspace/platform-explorer/packages/frontend/src/styles/mixins.scss` into `src/styles/mixins.scss`:
  - `Block($border: false, $borderColor: …)` — glassmorphic card (`backdrop-filter: blur(44px); border-radius: 30px; border: 1px solid rgba(255,255,255,0.1); background: rgba(24,31,34,0.2);`).
  - `DefListItem()` — the mono-font identifier line style.
  - `LoadingLine()` — the gradient sweep loading animation.
  - Keep the original comments so the port is auditable.
- `src/styles/global.scss` sets the dark page background gradient, default text color (`gray-100`), link styling (brand blue), and basic reset. Import fonts via `:root` variables.
- **Critically: no purple/violet anywhere.** The user explicitly rejects those colors as "generic AI". Stick to the documented palette.

### 4. Providers & layout

- `src/app/layout.tsx` forces dark mode (`data-theme='dark'`, `className='chakra-ui-dark'` on `<body>`).
- `src/app/Providers.tsx` composes:
  - `ChakraProvider` with the theme above.
  - `QueryClientProvider` (configure sensible defaults — staleTime 30s by default; page-level queries can override).
  - `NuqsAdapter` (the `nuqs` adapter for Next App Router).
  - `SdkProvider` (see below).
  - `BreadcrumbsProvider` (custom context; see below).
  - An error boundary (`ErrorBoundary`) that renders a themed error card.
- `src/components/layout/RootComponent.tsx` renders: `Navbar`, `{children}`, `Footer`. It should match the reference's RootComponent structure.
- `src/components/layout/Navbar.tsx` — fixed top, 66px, glass background, logo on the left, top-level nav items (Home · Identities · Contracts · Documents · Tokens · DPNS · Epoch · Governance · Network · About), `GlobalSearchInput` (placeholder — see below), `NetworkSelect`, optional `WalletStatus` placeholder. Mobile hamburger (Chakra `Drawer`).
- `src/components/layout/Footer.tsx` — fixed bottom, 66px on desktop, hidden on very small viewports. Shows local clock (refreshing every second), a version pill (read from `package.json` via a build-time constant), a GitHub link (placeholder URL for now), and a "Proofs ON/OFF" indicator driven by the SDK context.
- `src/components/layout/NetworkSelect.tsx` — dropdown between `mainnet` and `testnet`. Selection persists to `localStorage` under key `npe:network`. Changing the selection tears down the SDK client and reconnects.
- `src/components/layout/NetworkStatus.tsx` — small badge in navbar showing "Connecting…" / "Connected" / "Proofs verified" / "Disconnected". Driven by `SdkProvider`.

### 5. SDK provider

Create `src/sdk/SdkProvider.tsx`:

- React context exposing `{ sdk: EvoSDK | null, status: 'idle' | 'connecting' | 'ready' | 'error', network: 'testnet' | 'mainnet', trusted: boolean, error?: Error, reconnect(): void, setNetwork(n), setTrusted(t) }`.
- On first mount, read `npe:network` from `localStorage` (default testnet) and `npe:trusted` (default `true`), construct `EvoSDK.testnetTrusted()` / `mainnetTrusted()` / untrusted equivalents, and call `connect()`.
- Surface connection errors as the `error` field — don't throw.
- Reconnect on network change by destructuring the options and reconstructing.
- Guard against double-mount in React 18 dev StrictMode.

Create `src/sdk/hooks.ts`:

- `useSdk()` — returns the context.
- `useReadyEvoSdk()` — suspends until the SDK is ready; throws if it errors (so `ErrorBoundary` catches).
- Stubs for the richer hooks we'll build later: `useSdkQuery(key, fn, opts)` wrapping `useQuery` that injects the ready SDK into `fn`. Implement this stub now — Stage 2 will use it pervasively.

Create `src/sdk/networks.ts`:

- Export `type Network = 'mainnet' | 'testnet'`.
- `networkConfig[network]` with `explorerBaseUrl`, `l1ExplorerBaseUrl`. Copy URLs from `/Users/pasta/workspace/platform-explorer/packages/frontend/src/constants/networks.js`.

### 6. Breadcrumbs context

Port the pattern from `/Users/pasta/workspace/platform-explorer/packages/frontend/src/contexts/BreadcrumbsContext.js`. Detail pages will register their trail.

- `src/contexts/BreadcrumbsContext.tsx` — `{ items: BreadcrumbItem[], setBreadcrumbs(items), reset() }`.
- `BreadcrumbItem = { label: string; href?: string; avatarIdentifier?: string }`.
- Provider clears on route change.

### 7. Placeholder pages for every route

Create one `src/app/**/page.tsx` for **every route listed in PRD §6.2**:

```
/
/search
/identity/[id]
/identity/lookup/[pkh]
/contract/[id]
/contract/[id]/documents/[type]
/contract/[id]/documents/[type]/[docId]
/contract/[id]/tokens/[position]
/token/[id]
/token/[id]/holders
/address/[addr]
/dpns/[name]
/dpns/search
/epoch
/epoch/[index]
/epoch/history
/evonode/[proTxHash]
/network/status
/network/credits
/network/protocol
/network/quorums
/governance/contested
/governance/contested/[...slug]
/governance/polls
/groups/[contractId]
/groups/[contractId]/[position]
/state-transition/[hash]
/broadcast
/wallet
/settings
/about
/sdk-reference
```

Each page must:

- Be a client component (`"use client"`).
- Render an `Intro` section with the route-appropriate title.
- Render an `InfoBlock` with placeholder copy: "This page will be implemented in Stage N." (use the correct stage number from the build plan).
- Update breadcrumbs on mount via `useBreadcrumbs`.
- Use the layout's glass/card style from the theme.
- For dynamic routes, read the dynamic segment(s) and echo them in the placeholder copy.

### 8. Minimal UI primitives needed for Stage 1

You do not need to build all of them — just enough for the placeholder pages to look like the reference explorer. Build:

- `src/components/ui/Intro.tsx` — heading + optional description.
- `src/components/ui/InfoBlock.tsx` — glass card (uses the `Block` SCSS mixin).
- `src/components/ui/Container.tsx` — responsive container, 1310px max.
- `src/components/ui/CopyButton.tsx` — used in navbar URL example; full usage arrives later.
- `src/components/ui/Identifier.tsx` — initial version that renders a mono string with minidenticon avatar and copy button. The full version with highlight modes comes in Stage 2, but we need a minimum-viable version for the network status card.
- `src/components/breadcrumbs/Breadcrumbs.tsx` — renders the current breadcrumb trail from context.
- `src/components/search/GlobalSearchInput.tsx` — **rendering-only**. Debounced text input. On submit, navigates to `/search?q=<value>`. Do not implement the search dispatcher; `/search` page is still the placeholder.

### 9. Constants & registry

Create `src/constants/well-known.ts` with the structure described in PRD §11.4. Seed it with the known system data contracts (read IDs from `/Users/pasta/workspace/platform/packages/*-contract/` — specifically `dpns-contract`, `dashpay-contract`, `feature-flags-contract`, `masternode-reward-shares-contract`, `keyword-search-contract`). At minimum include DPNS (`GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec`) and Withdrawals (`4fJLR2GYTPFdomuTVvNy3VRrvWgvkKPzqehEBpNf2nk6`) on testnet. Mainnet IDs may differ; if you can find them, add them; otherwise leave them as TODO with clear comments.

### 10. Config & env

- `.env.local.example` with every `NEXT_PUBLIC_*` var from PRD §15.5.
- `src/config.ts` reads those vars (with typed accessors and defaults).
- `package.json` scripts:
  - `dev`: `next dev`
  - `build`: `next build`
  - `start`: `next start`
  - `lint`: `next lint`
  - `typecheck`: `tsc --noEmit`
  - `test`: `vitest run`
  - `test:watch`: `vitest`
  - `e2e`: `playwright test` (no tests yet — should exit 0)

### 11. Test scaffolding

- `vitest.config.ts` with JSX, happy-dom environment, path aliases wired.
- One sample unit test under `src/util/__tests__/smoke.test.ts` that exercises `util/credits.ts::creditsToDash` — create that util with the conversion from PRD §5 (1 DASH = 1e11 credits) and test a few values.
- Playwright config in `playwright.config.ts` pointing at `http://localhost:3000`. One empty spec file `e2e/smoke.spec.ts` that simply navigates to `/` and asserts the navbar is visible. This will actually run against `pnpm build && pnpm start` in CI.

### 12. CI

`.github/workflows/ci.yml`:

- Triggers: PR + push to `main`.
- Node 20, pnpm 9.
- Jobs:
  - `lint` — `pnpm lint`.
  - `typecheck` — `pnpm typecheck`.
  - `test` — `pnpm test`.
  - `build` — `pnpm build` (verifies static export succeeds).
  - Optional: `e2e` — starts the built app, runs Playwright smoke test. Mark it `continue-on-error` for this stage; we'll harden in Stage 6.

### 13. Progress tracking

Create `docs/progress.md`:

```markdown
# Progress

| Stage | Status | Commit | Notes |
|---|---|---|---|
| 1 — Foundation | ✅ Complete | <commit-sha> | … |
| 2 — Detail pages | ⏳ Pending | — | — |
| 3 — Browse & home | ⏳ Pending | — | — |
| 4 — Governance | ⏳ Pending | — | — |
| 5 — Proofs | ⏳ Pending | — | — |
| 6 — Write mode | ⏳ Pending | — | — |
```

Fill in stage 1's row when you're done.

## Scope — out (do NOT build in this stage)

- No real data rendering on detail pages. Placeholders only.
- No real search logic. The search input navigates to `/search?q=...` but `/search` is a placeholder.
- No charts. D3 is installed but unused.
- No proof verification UI.
- No wallet / signing / broadcast UI.
- No well-known registry editor.
- No diagnostics drawer.
- Do not port every reference-explorer component — only the minimal primitives listed in step 8.
- Do not install dependencies that are not listed above without documenting why.

## Implementation notes

- The `@dashevo/evo-sdk` package is ESM-only. Confirm Next.js treats your app as ESM (`"type": "module"` in `package.json` if needed, or rely on `.mjs` config files).
- The SDK loads a WASM blob. Next.js may need the `asyncWebAssembly: true` webpack experiment plus config to serve `.wasm` assets with the correct MIME type. If the SDK's package already ships a preconfigured bundle entrypoint that handles this (likely, given `webpack.config.cjs` in its source), use that. Otherwise add the experiment to `next.config.mjs`.
- Put everything under `src/`. Do not use the top-level `app/` directory.
- Use `'use client'` pragmas liberally. Because of the SDK, almost every page is client-rendered. We use `output: 'export'` so there's no server anyway.
- When `output: 'export'` is set, dynamic routes must define `generateStaticParams`. Because we don't know valid identities / contracts / etc. at build time, we use `dynamicParams: true` and `export const dynamic = 'force-static'` — but static export doesn't support runtime dynamic segments. **Solution**: use `output: 'export'` with `trailingSlash: true` and `dynamic = 'force-static'` combined with an empty `generateStaticParams` returning `[]`; client-side routing + `useParams()` handles the rest. Verify this works for at least one dynamic route (e.g. `/identity/[id]`) before declaring the stage done.
  - Alternative if that doesn't work: drop `output: 'export'` for Stage 1 and document it as a known issue to revisit in Stage 6. **Prefer making static export work.**
- Do not commit `.env.local` or `node_modules`.

## File deliverables (non-exhaustive inventory)

```
native-platform-explorer/
├── package.json, pnpm-lock.yaml (or equiv), tsconfig.json, next.config.mjs, .nvmrc, .eslintrc, .prettierrc
├── .env.local.example
├── .github/workflows/ci.yml
├── playwright.config.ts, vitest.config.ts
├── src/
│   ├── app/
│   │   ├── layout.tsx, Providers.tsx, page.tsx
│   │   ├── (all 30+ placeholder pages listed in step 7)
│   ├── components/
│   │   ├── layout/{Navbar,Footer,RootComponent,NetworkSelect,NetworkStatus}.tsx
│   │   ├── ui/{Intro,InfoBlock,Container,CopyButton,Identifier}.tsx
│   │   ├── breadcrumbs/Breadcrumbs.tsx
│   │   └── search/GlobalSearchInput.tsx
│   ├── sdk/{SdkProvider.tsx,hooks.ts,networks.ts}
│   ├── contexts/BreadcrumbsContext.tsx
│   ├── styles/{theme.ts,colors.ts,global.scss,mixins.scss,fonts.ts}
│   ├── constants/{well-known.ts,networks.ts,system-data-contracts.ts}
│   ├── util/credits.ts
│   └── config.ts
├── e2e/smoke.spec.ts
└── docs/progress.md
```

## Acceptance criteria

- [ ] `pnpm install` completes without errors.
- [ ] `pnpm dev` runs; home page loads; navbar and footer visible.
- [ ] `pnpm build` produces an `out/` directory.
- [ ] `pnpm lint` passes with zero errors.
- [ ] `pnpm typecheck` passes with zero errors.
- [ ] `pnpm test` passes (at least the smoke test).
- [ ] SDK connects to testnet on load (verify via the NetworkStatus badge in navbar).
- [ ] Switching network in the NetworkSelect tears down and reconnects the SDK.
- [ ] Every route in PRD §6.2 renders a themed placeholder page without errors.
- [ ] Visual parity check: open `/` side-by-side with `https://testnet.platform-explorer.com`. Fonts, colors, and the glass-card feel should match. Logo and exact layout naturally differ.
- [ ] `docs/progress.md` exists and Stage 1's row is marked complete.
- [ ] CI configuration file exists.
- [ ] No private keys, secrets, `.env.local`, or `node_modules/` are committed.

## Testing

- One unit test that covers `creditsToDash`.
- One Playwright smoke test that boots the app and asserts the navbar is visible.
- Both should pass locally and in CI.

## When complete

1. Run `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — all must pass.
2. Stage `git add` for all new files (do not use `git add -A`). Review the staged set carefully.
3. Commit with a conventional message, e.g.:
   ```
   chore(foundation): scaffold Next.js + Chakra + SDK provider + themed shell
   ```
4. Update `docs/progress.md` with the commit SHA.
5. **Stop. Do not start Stage 2.** Produce a short report to the user covering:
   - What was built (bulleted, one line each).
   - Any deviations from the PRD, with rationale.
   - Any unresolved issues (especially around `output: 'export'` + dynamic routes, or the SDK WASM integration).
   - Anything Stage 2 will need to know.
