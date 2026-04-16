# Stage prompts

Six sequential prompts that build the project from empty to PRD-complete. Each prompt is self-contained and written to be pasted into a coding agent.

## How to use

1. Read [`../PRD.md`](../PRD.md) first so you understand the target.
2. Run the stages **in order** — each assumes the previous stages are complete.
3. For each stage:
   - Open a fresh agent session.
   - Paste the contents of the stage prompt as the initial task.
   - Let the agent work; review the resulting commit(s).
   - When the agent reports the stage is complete, verify against the "Acceptance criteria" section, then move on.
4. After Stage 6, the project matches the PRD.

## Stages

| # | File | Delivers |
|---|---|---|
| 1 | [`stage-1-foundation.md`](stage-1-foundation.md) | Next.js shell + theme + SDK provider + layout + empty pages |
| 2 | [`stage-2-detail-pages.md`](stage-2-detail-pages.md) | Single-entity detail pages + real global search |
| 3 | [`stage-3-browse-home.md`](stage-3-browse-home.md) | Per-contract docs browser, epoch history, home dashboard |
| 4 | [`stage-4-governance.md`](stage-4-governance.md) | Governance, groups, protocol, network pages |
| 5 | [`stage-5-proofs.md`](stage-5-proofs.md) | Proof verification UX threaded through every page |
| 6 | [`stage-6-write-mode.md`](stage-6-write-mode.md) | Wallet signer adapters + full broadcast console |

## Conventions

- **PRD is the source of truth.** If a prompt and the PRD disagree, the PRD wins and the discrepancy should be flagged in the stage report.
- **Reference repos** that agents should read from are:
  - `/Users/pasta/workspace/platform-explorer` — the indexer-backed sibling whose styling and component structure we match.
  - `/Users/pasta/workspace/platform/packages/js-evo-sdk` — the SDK we integrate against.
  - `/Users/pasta/workspace/platform/packages/wasm-sdk` — SDK's WASM core (rarely needed directly).
- **Progress tracking.** Stage 1 creates `docs/progress.md`. Every subsequent stage updates it.
- **Commits** should follow conventional-commits (`feat(scope): …`, `chore(...): …`). One stage = at least one clean commit on `main`; larger stages may use multiple commits.
