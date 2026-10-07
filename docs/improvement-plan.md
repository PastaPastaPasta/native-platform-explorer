# Explorer improvements

This work follows the October 6, 2026 project review. The themes below define
design and acceptance criteria for separate implementations and reviews.
Some criteria, including enforced initial-JavaScript bundle budgets, remain
outstanding. Regression coverage and browser validation accompany each change.
The explorer continues to read directly through the SDK without an indexer.

| Theme | Design and acceptance |
|---|---|
| Data freshness | Requests bind to a ready SDK session and network; caller options cannot bypass readiness; obsolete responses are ignored; mutable documents refresh; Platform status polls; writes invalidate network-scoped reads. |
| Signers | Use the shipped SDK's async wallet/signing APIs; compare imported private keys to eligible current on-chain keys; fail closed when no suitable key exists; advertise unsupported capabilities before review. |
| Transactions | Freeze reviewed inputs and bind approval to the signer, identity, operation and SDK/network session; preserve an in-flight operation's origin; uncertain submissions require investigation rather than blind retry; show a receipt and entity links. |
| Proof evidence | Distinguish transport errors from verification failures; retain response timestamps and metadata; export versioned evidence with explicit trust assumptions; bound retained bytes; isolate inspector subscriptions. |
| SQL workspace | Correct signed averages; functional statement pagination; explicit bounded runs/cancellation and rerun; schema/index assistance; network/contract saved queries; precise JSON/CSV export; share links and SDK examples. |
| Exploration | Distinct invalid/not-found/unavailable search states; network-aware entity sharing and one local saved-items collection; consent revocation erases history; labeled keyboard-accessible controls. |
| Startup performance | Remove eager runtime SDK imports from tools; enforce initial-JavaScript bundle budgets; measure shell, module loading and connection independently; parse proof trees on demand. |
| Supported framework | Isolate the Next.js/React and lint migration, preserve static export, WASM loading and deployment prefix, and validate the resulting supported pairing. |
| Releases | Pin pnpm; bundle fonts locally; test the actual Pages prefix; deploy the same artifact that passed lint, types, unit and browser checks; align documentation with delivered behavior. |

## Deliberate adaptations

- Ordinary trusted SDK queries can verify internally. Captured proof bytes are
  optional evidence, not a prerequisite for classifying a successful response.
- Saved entities use one browser-local collection rather than introducing a
  larger collection hierarchy. It supports the practical navigation workflow
  and avoids an unnecessary storage abstraction.
- SDK cancellation cannot necessarily abort an already-started WASM request.
  Cancellation stops queued work and prevents obsolete responses from becoming
  active results; the interface must describe this limit accurately.
- A proof-parser worker is deferred until profiling with real proof bytes shows
  user-visible blocking. On-demand parsing and bounded retention address the
  observed overhead first.
- Unsupported SDK funding/broadcast or signer bridges are explicitly labeled;
  exposing a working-looking form is not a substitute for a safe implementation.
- Functional write-flow tests validate signing/review interfaces without moving
  funds. Production broadcasts are not part of the regression suite.

## Validation

Each implementation must pass relevant unit tests, lint, type checking and a
local production build. Browser evidence uses the precise tested revision and
states whether network data is live or a deterministic fixture. Final acceptance
also checks the integrated branches for API compatibility and remaining review
feedback. PRs are merged only after their checks and reviewed findings are ready.
