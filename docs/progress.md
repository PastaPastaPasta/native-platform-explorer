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

The stage table records the original implementation milestones; the stage
notes describe the code at the time (Next.js 14, the trusted-mode toggle,
preview-only write forms), not the current product. Later work added the
identity-signing bridge and document/contract operations, aggregate and
multi-statement SQL, backup import, deployment, and automated coverage, and the
October 2026 round below completed the write surface. Each operation must
advertise its current signer and SDK requirements; an interface or build
passing does not prove a live broadcast.

The SDK reference now lists the source-derived page-to-call mapping, with
search, route filters, and explicit conditional/proof-path limits. Builds reject
stale mapping data. Mainnet/Testnet identity creation and top-up link to the
configured bridge at `bridge.dashhq.org`; users choose the action and enter
their identity there. Bridge handoff passes the network only, and external
completion requires refreshing identity details in the explorer.

The CI workflow validates the same static export that Pages deploys, including
its configured deployment prefix. Live SDK integration checks remain separate from deterministic
browser and unit checks; they do not broadcast transactions.

## October 2026 correctness and write-surface round (PRs #37–#48)

Squash-merged into `main` on 2026-10-26. Each PR body records its validation in
full; this table summarizes what landed and what was checked. "Live" means the
served export in headless Chromium against real testnet or mainnet data.

| PR | Merge | Delivered | Verified |
|---|---|---|---|
| [#37](https://github.com/PastaPastaPasta/native-platform-explorer/pull/37) read surface | `5a53e58` | Proposer leaderboards ranked from a full paginated walk (not the first 100 evonodes); evonode vote panel matched by exact proTxHash; protocol tally over every vote with a stated denominator and "no vote yet"; quorum table with inferred type/threshold; Coinbase as the default rate provider; home epoch progress, quorum breakdown and quick actions; identicons as `<img>`. | Unit tests; live on mainnet (359 proposers, v13, 354 of 378 voters) and testnet (v14); unknown-epoch-length path on a custom devnet. |
| [#38](https://github.com/PastaPastaPasta/native-platform-explorer/pull/38) query and proofs | `4b1310d` | Proof parser rebuilt against grovedb 6.1.1 (sum/count nodes, PushInverted, V1 layout); readable parse errors and recovery after WASM traps; aggregates through `count/sum/averageWithProof`; protocol-aware index checks (v13 `matches`, v14 `matches_contiguous`); Drive-accurate GROUP BY notices; exact Next detection. | 916 unit tests; 53 e2e; live aggregates on a published testnet grades contract; Query Inspector parses an 8-layer AVG proof. |
| [#39](https://github.com/PastaPastaPasta/native-platform-explorer/pull/39) CI | `0c3c05d` | `validate` pinned to `ubuntu-24.04` (Playwright cannot install Chromium on 26.04); hydration-race fix in two e2e tests. | CI green; local repeat-each=5 run 15/15. |
| [#40](https://github.com/PastaPastaPasta/native-platform-explorer/pull/40) SDK sessions | `6b01fdd` | Untrusted mode removed (the WASM SDK needs a trusted context); startup timeout and session failure reasons; "Cannot reach Dash Platform" notice; Settings → Connection with SDK options and quorum-URL overrides (`NEXT_PUBLIC_QUORUM_URL_*`); retired-session cache cleanup; `classifySdkError` (absence vs transport vs missing quorum vs proof failure); Reconnect for missing quorums; version notice on /network/status. | 763 unit tests; 53 e2e with recorded quorum fixtures; live on both networks including an unreachable quorum override and an altered quorum list. |
| [#41](https://github.com/PastaPastaPasta/native-platform-explorer/pull/41) write-mode fixes | `967992f` | Contract updates publish `version + 1` and keep `$defs`; DIP-13 identity-key derivation for mnemonics; identity updates can add keys; DPNS and withdrawal validation; pre-submission errors reported as not submitted; key selection by contract bounds and document security level; ten-minute input-based idle clear; reviewed key pinned at signing; required secret declarations and `SecretInput`. | 917 unit tests; real-WASM tests; 53 e2e; forms built to Review on testnet. Nothing was broadcast. |
| [#42](https://github.com/PastaPastaPasta/native-platform-explorer/pull/42) query follow-ups | `e2eb6e9` | GROUP BY truncation wording; no truncation notice on a single total row; permissive index rules until the network reports its version. | Two new unit tests (fail on the previous code); 918 unit tests. |
| [#43](https://github.com/PastaPastaPasta/native-platform-explorer/pull/43) entity depth | `439d176` | Contract schema tree, history timeline with diffs, internal config, groups and token columns; token overview, rules, distributions, prices by tier and balance lookup; documents browser filters and cursors in the URL; document revision history; contested voters; group actions and signers; identity votes, contested-name pills and contract keys; /network/shielded. | 1130 unit tests; 53 e2e; live on testnet and mainnet (tokens, groups, contests, shielded pool). |
| [#44](https://github.com/PastaPastaPasta/native-platform-explorer/pull/44) navigation, URL state, registry | `a3439a7` | Sidebar links for every section; landing inputs instead of "Provide ?x="; URL state with nuqs; page titles; network-scoped well-known registry with remote loading and local entries; hover prefetch; search hints and inline DPNS prefix results; reduced-motion support; no overflow at 390 px. | 1207 unit tests; 60 e2e (new offline navigation spec); live on both networks. |
| [#45](https://github.com/PastaPastaPasta/native-platform-explorer/pull/45) SDK 5.0 | `b9600e5` | `@dashevo/evo-sdk` 5.0.0-rc.8; error-kind map keyed by name; auto-detected protocol version with two-way notice; write guard on session/network protocol mismatch; stale persisted-contract refresh and "Clear SDK cache"; 5.0 JSON shapes for votes, token rules and group actions; confirmed document id on create. | 1252 unit tests; 60 e2e; current-epoch replay passes on mainnet; 24 live proofs parsed; one testnet document create from Node (not through the explorer). |
| [#46](https://github.com/PastaPastaPasta/native-platform-explorer/pull/46) follow-ups | `99fe231` | DPNS search no longer shows the directory under results (the "wrong page 2" report); homograph-match labels and a prefix guard; one `NuqsAdapter`; shielded pool in the nav; landings for four detail routes; whole-number token and group positions. | 1220 unit tests; 60 e2e; live paging of "al", "da", "a" on mainnet and testnet. |
| [#47](https://github.com/PastaPastaPasta/native-platform-explorer/pull/47) address, identity, vote and raw writes | `787d7f4` | Form-signed operations: every `addresses.*` write, identity create and top-up from an asset lock, masternode votes, raw broadcast of a signed transition; plain-object address inputs for the rc.8 deserialization bug. | 1,326 unit tests; 63 e2e; every operation except the masternode vote run live on testnet with proved read-back. Masternode voting is unit-tested only (no voting key). |
| [#48](https://github.com/PastaPastaPasta/native-platform-explorer/pull/48) token writes | `4146238` | All 11 token writes plus group propose/co-sign; Drive-mirroring checks before Review and again before signing; CRITICAL key rules for token batches; destructive config updates; proved-read confirmation for the SDK's group-proposal `DriveProofError`; token page Actions row. | 1,504 unit tests; 66 e2e; 29 live testnet transitions with proved read-back. Not live: pre-programmed and once-per-identity claims, group co-sign of non-config actions, mainnet. |

**Discrepancy fixes and live write QA (`fix/discrepancies-l`).** Fixes the
eight discrepancies the #49 docs audit listed (read-only builds hide every
write link; the token balance lookup defaults to the last connected identity;
token writes appear in `/sdk-reference`; seeded holder balances get proofs;
aggregate presets use the testnet grades contract; stale network and env notes;
no `trusted` flag in share links) and checks the asset-lock key before
submission. It also ran the remaining writes live on testnet through the UI:
contract register and update; document create, replace, delete, transfer, set
price and purchase; identity credit transfer, withdrawal and key add/disable;
non-contested DPNS registration. That run found and fixed un-bumped document
revisions for transfer/price/purchase, optional fields submitted as `""`,
identifiers shown as `{"__type":"Identifier"}`, unlabelled schema form fields
and the normalized DPNS name in receipts. Still not live: masternode votes,
contested DPNS, some token claims, mainnet.

**In progress: I1, hardening (`chore/hardening`).** A parallel branch adds a
service worker / offline shell, a meta Content-Security-Policy, an
`integrity.json` with SRI hashes, a `Cargo.lock` for the vendored proof parser,
and dependency cleanup. It had not been opened as a PR or merged when this
section was written; none of it is shipped.

The [PRD](PRD.md) was rewritten to describe this state.
