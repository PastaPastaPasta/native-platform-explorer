# Startup performance

The explorer shell, query editor, wallet connection controls, and broadcast
operation picker should work while the SDK connects. Import SDK runtime values
inside asynchronous actions that require them. Use `import type` for SDK types.
Presentation helpers such as identifier formatting should use small utilities
instead of importing the SDK.

## Initial JavaScript budget

After a production build, run:

```sh
node scripts/check-bundle-budget.mjs
node --test scripts/__tests__/check-bundle-budget.test.mjs
```

The check reads `.next/app-build-manifest.json` when available and counts the
JavaScript in each route and all ancestor layouts. On Next 16 it reads the
exported `out/<route>/index.html` instead: its script tags include the initial
layout, page, runtime, and polyfill scripts. Shared chunks count once per route.
The dashboard, identity, query, wallet, and broadcast routes each have limits of
**512 KiB gzip and 2 MiB uncompressed**. CSS, preloads, and chunks imported
asynchronously after hydration are excluded. Missing pages, startup scripts, or
assets fail the check; remote or unsupported script URLs also fail rather than
escaping measurement. GitHub Pages base paths map to the same local exported
assets. An optional argument selects a build or export directory:

```sh
node scripts/check-bundle-budget.mjs /path/to/.next
node scripts/check-bundle-budget.mjs /path/to/out
```

HTML mode conservatively counts any listed `nomodule` polyfill, which an older
app build manifest may omit. Compare measurements using the same artifact format.

These are compressed artifact sizes, not browser load times. Before removing the
eager SDK imports, the query, wallet, and broadcast routes each required about
7.1 MiB gzip, including their root layout; the SDK chunk alone was about 6.8 MiB.
The corresponding dashboard and identity totals were about 343 and 350 KiB.
Do not increase the budget to accommodate an accidentally eager SDK import.

## Browser validation

Serve the production export at the deployment base path. In a fresh browser
context, temporarily delay the SDK chunk request and open `/query/`, `/wallet/`,
and `/broadcast/`. Before releasing that request:

- Enter SQL and use editor controls.
- Select a wallet connection method and enter its public identity identifier.
- Select broadcast operations and edit their forms.

Release the SDK request and confirm that the connection state and data recover.
Check the browser console for hydration, chunk-loading, and uncaught errors.
Keep shell readiness measurements separate from module loading, SDK construction,
and SDK connection. SDK connection includes WASM initialization and network or
quorum discovery; it must not be reported as pure WASM execution time.

The browser User Timing timeline exposes these measurements:

| Name | Measures |
| --- | --- |
| `npe:app-shell` | Navigation start to the first mounted application shell |
| `npe:sdk:module-load` | Asynchronous SDK module loading and evaluation |
| `npe:sdk:construct` | SDK factory and configuration |
| `npe:sdk:connect` | SDK connection, including runtime initialization and network setup |

SDK measurements have `detail.sessionId` and `detail.outcome` (`success`, `error`,
or `superseded`) so completed obsolete attempts cannot be mistaken for the active
session. Each phase retains at most 20 completed measures; the next sample clears
that phase's prior entries. The shell measure appears once per document. Timing
is optional and cannot change an SDK result or error in unsupported browsers.
Inspect the measurements in browser developer tools or the console:

```js
performance.getEntriesByType('measure').filter((entry) => entry.name.startsWith('npe:'))
```

## Proof inspection

Load proof parsing only when the user opens a proof tab. Bound retained inspector
data by bytes as well as entry count, and keep store recording actions independent
of entry subscriptions so recording a query does not rerender every query hook.

A proof worker is deferred until profiling demonstrates a bottleneck. Capture
representative real proof bytes, profile parsing and tree construction separately
from download and WASM initialization, and repeat with 4x CPU throttling. Consider
a worker if normal supported proofs repeatedly create parsing tasks over 50 ms
or block keyboard interaction. Record the proof size and timings before choosing
a worker; an asynchronous wrapper alone does not move work off the main thread.
