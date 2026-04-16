# native-platform-explorer

A client-only Dash Platform block explorer, powered exclusively by `@dashevo/evo-sdk`. No backend, no indexer, no database — the browser speaks directly to DAPI, verifies proofs locally, and renders live Platform state.

Designed as a sibling of [`pshenmic/platform-explorer`](https://github.com/pshenmic/platform-explorer): same dark mode, `#008DE4` brand, Montserrat/Open Sans/Roboto Mono typography, glassmorphic card vocabulary — but running entirely in the user's browser.

## Status

This repository contains the planning artifacts for the project.

- Full product requirements: [`docs/PRD.md`](docs/PRD.md)
- Implementation plan, broken into 6 sequential stages: [`docs/prompts/`](docs/prompts/)
- Live progress tracking: [`docs/progress.md`](docs/progress.md) (created when Stage 1 begins)

## Build plan

The implementation is split into 6 stages. Each is designed to be shippable on its own, so the project has a usable state after every stage.

| Stage | Delivers | Prompt |
|---|---|---|
| 1 | Foundation — Next.js shell, theme port, SDK provider, empty pages | [`stage-1-foundation.md`](docs/prompts/stage-1-foundation.md) |
| 2 | Single-entity detail pages + real search | [`stage-2-detail-pages.md`](docs/prompts/stage-2-detail-pages.md) |
| 3 | Browse surfaces + live home dashboard | [`stage-3-browse-home.md`](docs/prompts/stage-3-browse-home.md) |
| 4 | Governance, groups, protocol, network pages | [`stage-4-governance.md`](docs/prompts/stage-4-governance.md) |
| 5 | Proof verification UX — the differentiator | [`stage-5-proofs.md`](docs/prompts/stage-5-proofs.md) |
| 6 | Opt-in write mode — wallet adapters + broadcast console | [`stage-6-write-mode.md`](docs/prompts/stage-6-write-mode.md) |

Each prompt is self-contained and intended to be handed to a coding agent. Run them sequentially; at the end of stage 6 the project matches the PRD.

## License

MIT
