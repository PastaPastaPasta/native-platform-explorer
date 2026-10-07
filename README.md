# native-platform-explorer

A client-only Dash Platform block explorer, powered exclusively by `@dashevo/evo-sdk`. No backend, no indexer, no database — the browser speaks directly to DAPI, verifies proofs locally, and renders live Platform state.

Designed as a sibling of [`pshenmic/platform-explorer`](https://github.com/pshenmic/platform-explorer): same dark mode, `#008DE4` brand, Montserrat/Open Sans/Roboto Mono typography, glassmorphic card vocabulary — but running entirely in the user's browser.

## Status

The explorer includes entity details, schema-aware SQL and aggregate queries,
proof inspection, governance views, and opt-in write tools. Write operations
use the SDK's identity-signing bridge; availability depends on the connected
signer's eligible keys and the SDK's operation support. Unsupported funding,
raw-broadcast and extension paths are labeled in the interface.

- Full product requirements: [`docs/PRD.md`](docs/PRD.md)
- Per-stage progress + commit SHAs: [`docs/progress.md`](docs/progress.md)
- Implementation plan, broken into 6 sequential stages: [`docs/prompts/`](docs/prompts/)

## Development

```
pnpm install
pnpm dev       # Next.js dev server on http://localhost:3000
pnpm build     # static export to out/
pnpm lint
pnpm typecheck
pnpm test      # vitest
pnpm e2e       # playwright
```

Environment variables live in `.env.local.example` — copy to `.env.local`
and edit. The most important one is `NEXT_PUBLIC_DISABLE_WRITE_MODE=true`
for kiosk / read-only deployments: it hides `/wallet` and `/broadcast`
while keeping the rest of the explorer identical.

## Write mode

Opt-in. The explorer never stores keys: the mnemonic and WIF adapters keep
secrets only in tab memory and zero them on disconnect, idle-timeout, or
reload. Extension support is detection-only until the
`dash-platform-extension` public API stabilises. See [`/about`](src/app/about/page.tsx)
for the full proof + privacy explainer.

## Deploy

The build output is a plain `out/` directory. CI resolves the current GitHub Pages configuration (including custom
domains) and builds once at that deployment prefix, runs lint, type checking, unit coverage and Chromium
browser checks, then preserves `validated-pages`. Deployment downloads that
exact successful CI artifact for the current `main` commit. Failed or
superseded builds are not deployed. No rebuild happens during deployment.

Fraunces and JetBrains Mono are bundled locally with their OFL licenses;
Geist is bundled by its npm package. Builds do not fetch Google Fonts.
CI includes the complete font licenses in the validated deployment artifact.
The package manager is pinned in `package.json`.

The current custom domain uses the root prefix. To reproduce it locally, omit
`NEXT_PUBLIC_BASE_PATH` from the commands below. Project-prefix hosting is also covered:

```sh
NEXT_PUBLIC_BASE_PATH=/native-platform-explorer pnpm build
cp src/styles/fonts/Fraunces-OFL.txt src/styles/fonts/JetBrainsMono-OFL.txt out/
NEXT_PUBLIC_BASE_PATH=/native-platform-explorer pnpm e2e
```

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
