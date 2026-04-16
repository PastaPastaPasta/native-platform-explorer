# Progress

| Stage | Status | Commit | Notes |
|---|---|---|---|
| 1 — Foundation | ✅ Complete | `e039f40`, `27e6e67` | Scaffolded Next.js 14 + Chakra theme + SDK provider + breadcrumbs + 30+ placeholder pages. `pnpm lint && typecheck && test && build` all pass; static export produces `out/`. |
| 2 — Detail pages | ✅ Complete | `74207a2`, `5dc883d` | Identity / Contract / Document / Token / Address / DPNS / State-transition pages wired to real SDK; `/search` classifier + dispatcher; React Query hooks for all listed facades. Fix commit stabilises queryKey, drops `as never` casts, tunes staleTime, strips `.dash` before `isContestedUsername`. |
| 3 — Browse & home | ✅ Complete | (pending) | Filter + pagination primitives, schema helpers, `/contract/[id]/documents/[type]` browser, `/dpns/search`, real `/epoch`, `/epoch/[index]`, `/epoch/history`, `/evonode/[proTxHash]`, live home dashboard. |
| 4 — Governance | ⏳ Pending | — | — |
| 5 — Proofs | ⏳ Pending | — | — |
| 6 — Write mode | ⏳ Pending | — | — |

## Blockers

None yet.
