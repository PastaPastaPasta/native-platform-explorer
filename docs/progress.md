# Progress

| Stage | Status | Commit | Notes |
|---|---|---|---|
| 1 — Foundation | ✅ Complete | `e039f40`, `27e6e67` | Scaffolded Next.js 14 + Chakra theme + SDK provider + breadcrumbs + 30+ placeholder pages. `pnpm lint && typecheck && test && build` all pass; static export produces `out/`. |
| 2 — Detail pages | ✅ Complete | `74207a2`, `5dc883d` | Identity / Contract / Document / Token / Address / DPNS / State-transition pages wired to real SDK; `/search` classifier + dispatcher; React Query hooks for all listed facades. Fix commit stabilises queryKey, drops `as never` casts, tunes staleTime, strips `.dash` before `isContestedUsername`. |
| 3 — Browse & home | ✅ Complete | `1e13c66`, `a9894e1` | Filter + pagination primitives, schema helpers, `/contract/[id]/documents/[type]` browser, `/dpns/search`, real `/epoch`, `/epoch/[index]`, `/epoch/history`, `/evonode/[proTxHash]`, live home dashboard. Fix commit repairs votePollsByEndDate shape, stabilises home pollsQ key, tightens index-prefix validator. |
| 4 — Governance | ✅ Complete | `f07495f`, `3386715` | Governance + groups + protocol + network surface, seeded token holders with consent banner + LRU viewed-identities log. Identity Tokens/Groups/Votes tabs now real. Fix commit adopts `dataContractId` / `groupContractPosition` / `status` on group & contested-resource hooks; IdentityVotesTab reads `vote.choice.voteType`; /network/protocol tally compares `.version`. |
| 5 — Proofs | ✅ Complete | `979f833`, `c9fb14f` | ProofState + classify/aggregate helpers, ProofChip + ProofFailureBanner, hooks return `proofState`, no-proof-variant hooks tagged honestly, untrusted-mode navbar border + badge, real /settings (trusted toggle + diagnostics opt-in), DiagnosticsDrawer with ⌘/ + Ctrl+/ guarded against inputs, /about explainer with #proofs + #enumeration anchors. |
| 6 — Write mode | ✅ Complete | `7a378d7`, `a704993` | ExplorerSigner interface + mnemonic / WIF / extension-stub adapters, SignerProvider with idle-timeout + beforeunload wipe + surfaced reconnect hint, /wallet with three tabs + SignerStatusCard, /broadcast with facade/op rail + shared OperationShell (Build → Review → Sign → Broadcast → Result + mainnet typed-MAINNET confirmation + destructive ack), three representative preview-only forms (identity.topUp, dpns.registerName, raw stateTransitions.broadcast), kill switch honouring NEXT_PUBLIC_DISABLE_WRITE_MODE. |

## Current capabilities

The stage table records the original implementation milestones. Later work
added the identity-signing bridge and document/contract operations, aggregate
and multi-statement SQL, backup import, deployment, and automated coverage.
The original stage-6 preview-only limitation no longer describes the whole
write surface. Each operation must advertise its current signer and SDK
requirements; an interface or build passing does not prove a live broadcast.

The SDK reference now lists the source-derived page-to-call mapping, with
search, route filters, and explicit conditional/proof-path limits. Builds reject
stale mapping data. Mainnet/Testnet identity creation and top-up link to the
configured bridge at `bridge.dashhq.org`; users choose the action and enter
their identity there. Bridge handoff passes the network only, and external
completion requires refreshing identity details in the explorer.

The CI workflow validates the same static export that Pages deploys, including
its configured deployment prefix. Live SDK integration checks remain separate from deterministic
browser and unit checks; they do not broadcast transactions.
