# Stage 6: Write mode (opt-in)

> Stage 6 of 6 in the `native-platform-explorer` build plan.
> **Previous stages:** Stages 1–5 deliver the full read-only explorer with proof verification.
> **This stage delivers:** the optional, wallet-gated `/broadcast` console that lets users sign and submit every state transition the SDK exposes — plus the signer-setup flow at `/wallet`, and the final hardening pass.

## Mission

The explorer becomes **interactive**. Anything a user can do through the `@dashevo/evo-sdk` write facades, they can do from this UI: create identities, top up, transfer credits, publish contracts, update contracts, create/replace/delete/transfer/purchase/set-price documents, register DPNS names, mint/burn/transfer/freeze/claim tokens, vote as a masternode, do address-based funding and withdrawals.

Broadcasting is **opt-in** and **never involves the explorer holding private keys**. Three signer adapters: the Dash Platform Extension, an ephemeral mnemonic kept only in memory, and a single-use WIF paste.

After Stage 6, the project matches the PRD and is ready to ship.

## Required reading

- `docs/PRD.md` — sections 10 (write mode — the authoritative spec for this stage), 11.11 (security), 14.3 (offline / resilience), 15 (Build & Deployment).
- Every `*/facade.ts` file in `/Users/pasta/workspace/platform/packages/js-evo-sdk/src/` that contains write methods. List every write method, its `Options` type, and the required signer/key shape. This inventory drives the forms.
- `/Users/pasta/workspace/platform/packages/js-evo-sdk/src/wallet/` — every helper the wallet namespace exports (mnemonic gen/validate/derive, key pair import, message sign).
- `/Users/pasta/workspace/platform/packages/js-evo-sdk/src/state-transitions/facade.ts` — `broadcastStateTransition`, `waitForResponse`, `broadcastAndWait`, `waitForStateTransitionResult`.
- `/Users/pasta/workspace/dash-platform-extension/` — the browser extension we integrate as a signer. Find the public API (likely `window.dashPlatform` or `postMessage`-based). If the extension's surface is unclear, implement a stub adapter with the real integration TODO'd and documented.
- `/Users/pasta/workspace/evo-sdk-website/public/index.html` + its accompanying JS — the SDK team's own interactive demo uses a pattern very similar to what we need. Steal the cascading "facade → operation → dynamic form → execute" structure, but re-implement it in React + TypeScript with our theming.
- `docs/progress.md` — confirm Stages 1–5 complete.

## Assumed state entering this stage

- Stages 1–5 committed, all acceptance criteria met.
- `ProofChip`, `ProofFailureBanner`, `DiagnosticsDrawer` exist and thread through everywhere.
- `/broadcast` and `/wallet` are still Stage-1 placeholders.

## Scope — in

### 1. Signer interface + adapters

`src/signer/types.ts`:

```ts
export interface ExplorerSigner {
  readonly kind: 'extension' | 'mnemonic' | 'wif';
  readonly identityId: Identifier;
  availableKeys(): Promise<IdentityPublicKey[]>;
  sign(preimage: Uint8Array, keyId: number, purpose: KeyPurpose): Promise<Uint8Array>;
  /** Called when the user disconnects. Adapters MUST zero any in-memory secrets here. */
  destroy(): void;
}
```

#### 1a. Extension adapter — `src/signer/extension.ts`

- Detect the Dash Platform Extension at page load (likely polling for `window.dashPlatform` for a few hundred ms).
- Expose `detectExtension()` + `createExtensionSigner(identityId)` which asks the extension to approve each `sign(...)` call via `postMessage` / the extension's real API.
- **If the extension API cannot be determined from the repo at `/Users/pasta/workspace/dash-platform-extension/`**, implement a placeholder adapter that `throw`s with a clear "Dash Platform Extension integration pending — please use mnemonic or WIF" message, and open a GitHub-style TODO comment pointing at the exact integration hook. Do not block the stage on the extension.

#### 1b. Mnemonic adapter — `src/signer/mnemonic.ts`

- Uses `wallet.validateMnemonic`, `wallet.mnemonicToSeed`, and `wallet.deriveKeyFromSeedWithPath` + `wallet.derivationPathDip13Testnet/Mainnet` to derive identity keys.
- **Never** writes the seed or derived private keys to `localStorage`. Kept in an in-memory module-level variable only, and cleared:
  - on manual disconnect;
  - when the tab becomes hidden for >10 minutes;
  - on route change away from `/broadcast` if the user explicitly ticks "clear on navigation" (default on);
  - on `beforeunload`.
- Derivation options: default to DIP13 account 0. For power users, expose an "Advanced" accordion with custom BIP32 path.

#### 1c. WIF adapter — `src/signer/wif.ts`

- `wallet.keyPairFromWif(wif)` → key pair.
- One-key-at-a-time. Associates that key pair with a user-specified identity ID (no auto-discovery).
- Same in-memory lifetime guarantees as mnemonic adapter.

#### 1d. Signer context — `src/signer/SignerProvider.tsx`

- React context exposing `{ signer: ExplorerSigner | null, connect(adapter, params), disconnect() }`.
- Persists *only* the chosen adapter kind + identity ID (not the key material!) to `sessionStorage`. On reload, prompts the user to re-authenticate.

### 2. `/wallet/page.tsx` — signer setup

- Three tabs: Extension · Mnemonic · WIF.
- Each tab walks the user through connecting their chosen signer.
- Sticky safety banner: "The explorer never stores your keys. Mnemonic / WIF live only in this tab's memory and are cleared on navigation / reload / inactivity."
- On successful connect, render a `SignerStatusCard` with:
  - Adapter kind chip.
  - Identity ID with `Identifier` link to `/identity/[id]`.
  - Available keys (from `signer.availableKeys()`).
  - "Disconnect" button that destroys the adapter.
- If write mode is disabled (`NEXT_PUBLIC_DISABLE_WRITE_MODE=true`), the route renders a clear "Write mode is disabled in this build" notice and hides every Stage 6 affordance elsewhere in the app. Ditto for `/broadcast` and the navbar `WalletStatus` pill.

### 3. `/broadcast/page.tsx` — the broadcast console

Mirror the `evo-sdk-website` three-pane structure, in React + Chakra:

- **Left rail** (responsive: becomes a top-bar drawer on mobile):
  - Facade selector (Identities / Addresses / Documents / Contracts / Tokens / DPNS / Voting).
  - Operation selector (dependent on facade): the list of write methods on that facade.
  - Each operation has a short description.
- **Main panel**: dynamic form for the selected operation.
- **Right panel**: live preview of the `options` object being built (JSON, pretty-printed, updating as the user types). Toggle "show raw state transition" that serialises the would-be ST once all fields are valid.
- **Footer**: Review → Sign → Broadcast buttons (visible once the form is valid).

Each step renders as its own sub-panel:

1. **Build** — dynamic form per operation (see §4).
2. **Review** — decoded options + fee estimate (if the SDK surfaces it; if not, say "fee estimate unavailable from SDK; it will be computed on broadcast").
3. **Sign** — calls `signer.sign(...)` (one UX per adapter kind; extension pops its own consent UI; mnemonic/WIF just click "Sign").
4. **Broadcast** — calls the appropriate facade method (default `sdk.stateTransitions.broadcastAndWait`, with option to switch to fire-and-forget `broadcastStateTransition`).
5. **Result** — proof result rendered with `CodeBlock`. Deep-link to `/state-transition/[hash]` if a hash is known. Links to every affected entity (e.g. a new identity → its `/identity/[id]`).

URL state: `?facade=identities&op=topUp` lets the user deep-link to a particular form.

### 4. Forms per operation

Build a dedicated form component per write method. Structure:

```
src/components/broadcast/forms/
├── identities/
│   ├── Create.tsx, TopUp.tsx, CreditTransfer.tsx, CreditWithdrawal.tsx, Update.tsx
├── addresses/
│   ├── Transfer.tsx, TopUpIdentity.tsx, Withdraw.tsx, TransferFromIdentity.tsx, FundFromAssetLock.tsx, CreateIdentity.tsx
├── documents/
│   ├── Create.tsx, Replace.tsx, Delete.tsx, Transfer.tsx, Purchase.tsx, SetPrice.tsx
├── contracts/
│   ├── Publish.tsx, Update.tsx
├── tokens/
│   ├── Mint.tsx, Burn.tsx, Transfer.tsx, Freeze.tsx, Unfreeze.tsx, DestroyFrozen.tsx, EmergencyAction.tsx, SetPrice.tsx, DirectPurchase.tsx, Claim.tsx, ConfigUpdate.tsx
├── dpns/
│   └── RegisterName.tsx
└── voting/
    └── MasternodeVote.tsx
```

Per-form rules:

- **Typed inputs**: derive inputs from each operation's `Options` type. Keep a lightweight schema object per form that the `OperationForm` shell reads to generate validated inputs.
- **Schema-driven document forms**: when creating/replacing a document, fetch the target contract via `useContract(contractId)` and generate the form from the document type's JSON Schema (same technique as Stage 3's filter generator). Reject submission if the document doesn't validate against the schema.
- **Sensible defaults**: pre-fill fields from the current signer's identity and the currently-selected network where possible.
- **Review-step summary**: every form renders a human-readable summary ("Transfer 1 DASH from alice.dash to bob.dash"), not just a JSON dump.
- **Safety rails**: destructive operations (`documents.delete`, `tokens.destroyFrozen`, `tokens.emergencyAction`, `identities.update` with key disables) render a danger-red warning panel that must be ticked before the Review step.

### 5. Shared broadcast shell

`src/components/broadcast/OperationShell.tsx`:

- Drives the Build → Review → Sign → Broadcast → Result flow.
- Takes a `formDescriptor` ({ title, description, inputs, buildOptions, summarise, facadeCall }) and renders the right steps.
- Handles loading, errors, partial failures (broadcast succeeded but `waitForResponse` timed out).
- Stores in-progress form values in `sessionStorage` so a page reload doesn't lose typing (except for any key material).

### 6. Mainnet safety confirmation

Broadcasting on **mainnet** requires:

- Explicit checkbox "I understand this action will be executed on mainnet".
- Typed confirmation: user must type `MAINNET` into a confirmation field.
- Extra-large danger banner throughout the flow.

This only applies when `sdkProvider.network === 'mainnet'`. Testnet has no extra confirmation beyond the per-form safety rail on destructive ops.

### 7. Write-mode kill switch

- `NEXT_PUBLIC_DISABLE_WRITE_MODE=true` at build time:
  - Hides `/broadcast`, `/wallet` from the navbar and returns a "not available in this build" page at those routes.
  - Hides the `WalletStatus` pill.
  - All `ExplorerSigner` code still ships (to keep bundles consistent) but no UI reaches it.
  - Document in `/about` how to disable.

### 8. Hardening pass (required for Stage 6 completion)

- **Playwright e2e expansion**:
  - One test per major facade: use a **dev-only** signer backed by a hardcoded testnet mnemonic provided in `e2e/.env.test.local` (gitignored). Skip the test if the env file is missing, so forks don't flake CI.
  - Cover at minimum: identity top-up, document create, token transfer, DPNS availability check → register.
- **a11y audit**: run `pnpm add -D @axe-core/playwright` and add an axe check per top-level route. Fix any WCAG AA failures.
- **Performance pass**: lazy-load the WASM SDK + D3 + react-markdown bundles (`dynamic()` imports + suspense). Confirm `/` first-load under 150 KB JS (not counting WASM). Lighthouse performance >= 90 on mobile throttling.
- **SBOM + SRI**: `pnpm ls --json > sbom.json` in CI; emit integrity hashes for every chunk using `next-secure-headers` or a custom script. Commit the helper.
- **Service Worker**: add a bare-bones Workbox SW that caches the app shell for offline use; deliberately does *not* cache SDK/DAPI responses (per PRD §14.3).
- **Build + deploy pipeline**:
  - `.github/workflows/deploy.yml` — on tag `v*.*.*`, build the static `out/` and publish to:
    - Vercel (if `VERCEL_TOKEN` is set);
    - IPFS (if `WEB3_STORAGE_TOKEN` is set).
  - Keep `continue-on-error` on the IPFS step; Vercel is the default.
- **Release notes**: `.github/release-drafter.yml` generating release drafts from PR labels (matching `platform-explorer`'s approach).

### 9. Documentation

- Update root `README.md`:
  - Add a "Development" section with the quickstart (`pnpm install && pnpm dev`).
  - Add a "Deploy" section referencing `.github/workflows/deploy.yml`.
  - Add a brief note on write mode (opt-in, kill-switch env var).
- Update `/about` to include a section on write mode and signer safety.
- Ensure `/sdk-reference` lists every write operation with its form route.

### 10. Final progress write

Close out `docs/progress.md`:

```markdown
| 6 — Write mode | ✅ Complete | <commit-sha> | PRD fully implemented. |
```

Add an overall summary paragraph at the bottom.

## Scope — out

- No custom key generation UI beyond what the `wallet` namespace already supports.
- No identity recovery flows.
- No integration with hardware wallets (Ledger / Trezor). Deferred.
- No persistent key storage (explicitly rejected in PRD §11.11).
- No server-side broadcasting — every broadcast goes directly from the browser to DAPI through the SDK.

## Acceptance criteria

- [ ] `/wallet` supports Mnemonic and WIF flows end-to-end on testnet (Extension flow connects if the extension is present; graceful message otherwise).
- [ ] `/broadcast` exposes every write method listed in PRD §5.2 and the inventory in this prompt, each with a dedicated form.
- [ ] Submitting a form walks Build → Review → Sign → Broadcast → Result and ends in a link to the affected entity on the read side of the app.
- [ ] Destructive operations show a danger banner and require explicit confirmation.
- [ ] Switching to mainnet adds the typed-MAINNET confirmation; testnet does not.
- [ ] `NEXT_PUBLIC_DISABLE_WRITE_MODE=true` hides every Stage 6 UI affordance; `/wallet` and `/broadcast` return the "not available" page.
- [ ] Reloading the page while a signer is connected prompts for re-auth (no key material survived).
- [ ] E2E tests for at least identity top-up, document create, token transfer, and DPNS register pass on testnet (skipped when `e2e/.env.test.local` is missing).
- [ ] Axe a11y checks pass on every top-level route.
- [ ] Lighthouse performance >= 90 on `/`, `/identity/[id]`, and `/contract/[id]` with mobile throttling.
- [ ] `.github/workflows/deploy.yml` builds + publishes the static site.
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` all pass.
- [ ] `docs/progress.md` is fully populated, Stage 6 row complete.

## Testing

- Unit: every form's `buildOptions()` function (input → SDK options object). At least one round-trip test per form.
- Unit: mnemonic adapter's lifecycle (derive → sign → destroy wipes state).
- Component: `OperationShell` flow with a mocked signer and mocked SDK facade — assert that Review → Sign → Broadcast produces the expected calls.
- E2E: the write-flow tests from §8.

## When complete

1. Full lint/typecheck/test/build clean.
2. Smoke-test a real broadcast on testnet: create a document, sign via mnemonic adapter, broadcast, observe it at `/state-transition/[hash]` and at the relevant contract's documents list.
3. Verify the kill switch works: rebuild with `NEXT_PUBLIC_DISABLE_WRITE_MODE=true` and walk the app to confirm write-mode UI is invisible.
4. Commit in logical chunks (signers, broadcast shell, forms, hardening, deploy). Example titles:
   - `feat(signer): ExplorerSigner interface + mnemonic/WIF/extension adapters`
   - `feat(broadcast): operation shell + identity/address/document forms`
   - `feat(broadcast): contract/token/DPNS/voting forms`
   - `chore(hardening): a11y, perf, SBOM, service worker, deploy pipeline`
5. Tag the repo `v1.0.0`.
6. Produce the final report to the user:
   - Confirm every PRD section is implemented (or explicitly marked as deferred).
   - Known issues.
   - Deploy URLs once the pipeline runs.
