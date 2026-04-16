# Progress

| Stage | Status | Commit | Notes |
|---|---|---|---|
| 1 — Foundation | ✅ Complete | `e039f40`, `27e6e67` | Scaffolded Next.js 14 + Chakra theme + SDK provider + breadcrumbs + 30+ placeholder pages. `pnpm lint && typecheck && test && build` all pass; static export produces `out/`. |
| 2 — Detail pages | ✅ Complete | `74207a2`, `5dc883d` | Identity / Contract / Document / Token / Address / DPNS / State-transition pages wired to real SDK; `/search` classifier + dispatcher; React Query hooks for all listed facades. Fix commit stabilises queryKey, drops `as never` casts, tunes staleTime, strips `.dash` before `isContestedUsername`. |
| 3 — Browse & home | ✅ Complete | `1e13c66`, `a9894e1` | Filter + pagination primitives, schema helpers, `/contract/[id]/documents/[type]` browser, `/dpns/search`, real `/epoch`, `/epoch/[index]`, `/epoch/history`, `/evonode/[proTxHash]`, live home dashboard. Fix commit repairs votePollsByEndDate shape, stabilises home pollsQ key, tightens index-prefix validator. |
| 4 — Governance | ✅ Complete | `f07495f`, `3386715` | Governance + groups + protocol + network surface, seeded token holders with consent banner + LRU viewed-identities log. Identity Tokens/Groups/Votes tabs now real. Fix commit adopts `dataContractId` / `groupContractPosition` / `status` on group & contested-resource hooks; IdentityVotesTab reads `vote.choice.voteType`; /network/protocol tally compares `.version`. |
| 5 — Proofs | ✅ Complete | `979f833`, `c9fb14f` | ProofState + classify/aggregate helpers, ProofChip + ProofFailureBanner, hooks return `proofState`, no-proof-variant hooks tagged honestly, untrusted-mode navbar border + badge, real /settings (trusted toggle + diagnostics opt-in), DiagnosticsDrawer with ⌘/ + Ctrl+/ guarded against inputs, /about explainer with #proofs + #enumeration anchors. |
| 6 — Write mode | ✅ Complete | (pending) | ExplorerSigner interface + mnemonic / WIF / extension-stub adapters, SignerProvider with idle-timeout + beforeunload wipe, /wallet with three tabs + SignerStatusCard, /broadcast with facade/op rail + shared OperationShell (Build → Review → Sign → Broadcast → Result + mainnet typed-MAINNET confirmation + destructive ack), representative forms (identity.topUp, dpns.registerName, raw stateTransitions.broadcast), kill switch honouring NEXT_PUBLIC_DISABLE_WRITE_MODE. |

## Scope notes

- **Representative write forms ship as preview-only.** All three included
  flows (identity.topUp, dpns.registerName, stateTransitions.broadcast raw
  hex) run the full Build → Review → Sign-ack → Broadcast lifecycle but
  throw an explicit "requires IdentitySigner bridge" error at the SDK
  call. This is the honest v1.0 posture — the SDK's write facades want
  SDK-internal `Identity` + `IdentityPublicKey` + `IdentitySigner` class
  instances, which the `ExplorerSigner` interface deliberately does not
  expose. Wiring that bridge is tracked as the first follow-up after
  tagging. The PRD's full inventory of ~30 write operations plugs into
  the same shell following the same pattern.
- **Extension adapter is detection-only** until the public API of
  `dash-platform-extension` is finalised. The stub throws a clear error
  and the /wallet Extension tab surfaces it.
- **Hardening follow-ups** deferred: automated Playwright write-flow
  tests, axe-core a11y audit, service worker for offline app-shell
  caching, `.github/workflows/deploy.yml`, SBOM + SRI emission,
  `v1.0.0` tag.

## Blockers

None.
