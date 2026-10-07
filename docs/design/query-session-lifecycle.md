# SDK query sessions and freshness

The explorer must never execute a request with a different SDK than the one named by its cache key. A network/trust change or same-network reconnect must also retire outstanding requests and inspector side effects immediately.

## Design

`SdkProvider` assigns a unique session ID and abort signal to every connection attempt. The outgoing signal is aborted synchronously before network, trust, or reconnect changes; reconnect also clears the old SDK. Superseded connection results are ignored, and unmount aborts the current session. Session IDs remain unique across provider remounts.

One low-level `useSdkQuery` wrapper owns readiness, cache keys, and cancellation. Keys use `['npe', network, trusted, sessionId, ...methodKey]`; caller options can disable execution but cannot force an unready SDK to execute. The query captures its ready SDK instead of polling a mutable SDK reference. Session abortion cancels the exact React Query request. Since the SDK cannot abort all its requests, the execution guard also rejects delayed results and suppresses inspector records and fallback requests from retired sessions.

The proof-aware wrapper retains proof transport and capture behavior while delegating the lifecycle boundary to the same low-level wrapper used by write forms. Proof classification improvements are a separate change.

Documents fetched by ID have 30-second freshness because their revisions can change. Deterministic validation and finalized epoch queries remain indefinitely fresh. Platform status now polls every 30 seconds, matching Core status. Core queries wait for a ready network selection, and health is unknown while the SDK is connecting or unavailable.

Confirmed writes call `invalidateNetworkQueries(client, submittedNetwork)`. The network prefix invalidates all trust/session variants, including balances, nonces, schemas, and list queries whose relationships cannot safely be inferred from one receipt. Transaction-shell wiring is a separate change. Failed or uncertain writes must not use this confirmation helper.

Network-aware links synchronize `?network=` during client navigation through a small `useSearchParams` component with its own Suspense boundary. Unknown URL networks stop SDK execution and show an accessible error; selecting a configured network repairs the parameter. History updates use Next's supported `replaceState(null, ...)` path to keep router search parameters synchronized.

Initial selection follows URL, valid saved preference, then configured default precedence. The saved custom-network registry is loaded before validation, so custom devnet defaults and links work. Unknown configured defaults or explicit selections never create an SDK using `getNetwork`'s display fallback. Their visible errors remain blocked until a configured network is selected; removing an invalid URL only restores a known selection. Browser storage is optional: blocked getters/reads use configured defaults, stale saved names are ignored, and failed writes leave the selected network/trust active in memory.

## Validation

Regression tests cover readiness options, delayed proof responses across network/trust/reconnect changes, cancellation without stale evidence or fallback, mutable document freshness, idle Platform polling, network-scoped invalidation, superseded connections, reconnect reset, unmount, URL hydration/navigation, and invalid-link recovery. Root browser validation must also exercise selecting a network and then submitting a search/query, because unit tests do not run Next's patched history implementation.
