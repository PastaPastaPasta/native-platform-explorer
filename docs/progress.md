# Progress

| Stage | Status | Commit | Notes |
|---|---|---|---|
| 1 — Foundation | ✅ Complete | `e039f40`, `27e6e67` | Scaffolded Next.js 14 + Chakra theme + SDK provider + breadcrumbs + 30+ placeholder pages. `pnpm lint && typecheck && test && build` all pass; static export produces `out/`. |
| 2 — Detail pages | ✅ Complete | `74207a2`, `5dc883d` | Identity / Contract / Document / Token / Address / DPNS / State-transition pages wired to real SDK; `/search` classifier + dispatcher; React Query hooks for all listed facades. Fix commit stabilises queryKey, drops `as never` casts, tunes staleTime, strips `.dash` before `isContestedUsername`. |
| 3 — Browse & home | ✅ Complete | `1e13c66`, `a9894e1` | Filter + pagination primitives, schema helpers, `/contract/[id]/documents/[type]` browser, `/dpns/search`, real `/epoch`, `/epoch/[index]`, `/epoch/history`, `/evonode/[proTxHash]`, live home dashboard. Fix commit repairs votePollsByEndDate shape, stabilises home pollsQ key, tightens index-prefix validator. |
| 4 — Governance | ✅ Complete | `f07495f`, `3386715` | Governance + groups + protocol + network surface, seeded token holders with consent banner + LRU viewed-identities log. Identity Tokens/Groups/Votes tabs now real. Fix commit adopts `dataContractId` / `groupContractPosition` / `status` on group & contested-resource hooks; IdentityVotesTab reads `vote.choice.voteType`; /network/protocol tally compares `.version`. |
| 5 — Proofs | ✅ Complete | (pending) | ProofState + classify/aggregate helpers, ProofChip + ProofFailureBanner, hooks return `proofState`, no-proof-variant hooks tagged honestly, untrusted-mode navbar border + badge, real /settings (trusted toggle + diagnostics opt-in), DiagnosticsDrawer with ⌘/ + Ctrl+/, /about explainer with #proofs + #enumeration anchors. |
| 6 — Write mode | ⏳ Pending | — | — |

## Blockers

None yet.
