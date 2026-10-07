# Supported framework baseline

The explorer uses Next.js **16.3.8** and React / React DOM **19.3.0**, with Node.js
**22.13.0+ on the Node 22 LTS line, or Node 24+**. Next.js 16 is the active LTS
major; Next.js 15 is maintenance LTS and Next.js 14 is unsupported under the [official support policy](https://nextjs.org/support-policy).
The browser baseline is Chrome / Edge / Firefox 111+ and Safari 16.4+, matching
the [Next.js 16 requirements](https://nextjs.org/docs/app/guides/upgrading/version-16).

The upgrade targets the established September 30, 2026 patch of Next.js 16.
Next.js 16.4.0 was published on October 6, 2026 and had not cleared the local
package manager's minimum release age at the time of this migration. React 19
also satisfies the [App Router migration requirements](https://nextjs.org/docs/app/guides/upgrading/version-15)
for Next.js 15, so staying on that major would not avoid the React migration.

## Compatibility choices

- The project Node requirement follows the complete locked development toolchain.
  In particular, `eslint-visitor-keys` 5.0.1 requires `^20.19.0 || ^22.13.0 || >=24`.
  The project uses the maintained Node 22 LTS line or Node 24+, excluding Node 23,
  which that dependency does not support. Next.js itself has a lower runtime
  minimum of Node 20.9.0; it does not define the project's build and lint minimum.
- Development and production explicitly use Webpack (`next dev --webpack` and
  `next build --webpack`). This preserves the existing asynchronous WASM and raw
  Markdown handling instead of silently switching to Next.js 16's Turbopack
  default. The SDK remains pinned to `@dashevo/evo-sdk` 4.0.0-rc.2.
- Static export, trailing slashes, unoptimized images, and
  `NEXT_PUBLIC_BASE_PATH` remain supported. The migration adds no server runtime,
  API routes, or broadcasting behavior.
- TypeScript uses the automatic JSX runtime required by Next.js 16 and includes
  generated development route types. The application has no server-side request
  APIs or page `params` / `searchParams` props requiring asynchronous conversion;
  browser search parameters continue to use `next/navigation`.
- Chakra UI 2, Emotion, Framer Motion 11, TanStack Query, and the nuqs App Router
  adapter declare React 19 compatible peers. Chromium coverage checks real
  drawer navigation, modal focus restoration, and query URL state after reload.
- Next.js 16 removes `next lint`, so `pnpm lint` calls ESLint directly with a flat
  config. Rules of Hooks, exhaustive dependencies, Next.js Web Vitals checks, and
  TypeScript checks remain enabled. Four new React Compiler diagnostics
  (`refs`, `purity`, `set-state-in-effect`, and `set-state-in-render`) remain
  disabled during this isolated migration: existing components require separate
  refactoring before compiler adoption, and the compiler is not enabled.
- ESLint 9.39.5 is retained because the current React, import, and JSX accessibility
  plugins shipped with Next.js do not declare ESLint 10 support. ESLint 9 is now
  deprecated upstream; upgrade this development tool when that plugin ecosystem
  supports ESLint 10. This does not affect the supported Next.js runtime baseline.

The lockfile also refreshes the existing Sass / PostCSS transitive dependencies
Immutable.js to 5.1.9 and source-map-js to 1.2.2, resolving their published denial
of service advisories without adding application dependencies.

## Verification

Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm e2e`.
For a project deployment, rebuild with
`NEXT_PUBLIC_BASE_PATH=/native-platform-explorer pnpm build`, serve `out/` at that
prefix, and set the same environment variable when running the framework browser
compatibility tests. Root-domain deployments leave the base path empty.

Next.js 16 no longer emits `.next/app-build-manifest.json`. Bundle checks should
use the script resources in the exported HTML to measure each route's initial
JavaScript, rather than depending on that removed internal manifest.
