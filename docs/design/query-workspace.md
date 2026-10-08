# Query workspace

The workspace translates a small, explicit SQL subset into native SDK document or aggregate queries. It does not introduce an indexer or a general SQL execution engine.

## Execution

A run captures the SQL, selected contract, network, trust setting, and SDK instance. A unique execution ID also isolates its React Query entries from earlier runs, including a cancelled run with identical SQL. At most two statements in one run execute at a time. Each statement owns its cursor stack and can page independently. An explicit document default of 25 is sent to the SDK, so the visible page size and continuation controls agree even when LIMIT is omitted.

Editing SQL or changing the selected contract, network, trust setting, or SDK instance hides the obsolete run immediately. Cancel removes the run and stops queued statements. The SDK has no transport cancellation interface here: requests already started may finish, but cannot supply a replacement run's displayed results. The concurrency limit applies to each run, not to unabortable requests remaining from an earlier cancelled run.

Schema suggestions expose document types, fields, and index order. They quote identifiers and generate starting statements; the Platform remains responsible for validating the complete filter/sort combination. Unsupported SQL, unterminated quoting, invalid limits, and clearly lossy numeric literals fail in the editor. Ordinary decimal filters retain JavaScript Number semantics. Exact large-integer filters should use the SDK directly.

## Saving, sharing, and reproduction

Saved queries are explicitly opted into one at a time and scoped to the selected network and picker contract, including for SQL that specifies a different contract alias. They store names and SQL locally, never results. The interface states that browser-profile users can read their filter values, provides individual deletion and scope clearing, and bounds record count and input sizes. Loading a saved query edits the workspace without executing it.

Save, Delete, and Clear read the latest persisted list before applying the action, preserving changes committed by another tab even before its storage event arrives. Storage events refresh the selected scope's list without replacing name or SQL drafts or loading a query. Saving a new name at the current storage limit fails explicitly; replacing an existing name still works. These localStorage read/write operations are not transactional: genuinely simultaneous writes from separate tabs can still race.

Shared links contain SQL, selected contract, and network. They preserve the current hosting base path. A registered custom devnet must also be configured in the recipient's browser; its endpoints are not embedded in query links. Running a query also puts its SQL in the address bar, so filter values are included in browser history.

Exports contain the current page. JSON records the SDK version, network, trust setting, retrieval time, parsed statement, SDK parameters, and raw result. BigInts become exact decimal strings. CSV retains their decimal digits; spreadsheet users must import integer columns as text to avoid application-level rounding. Formula-like text is escaped. Aggregate group keys retain their canonical encoding. SDK examples use the pinned package's factories and connection step, and normalize SDK Documents before JSON serialization.

## Scope adaptations

Schema discovery uses explicit controls rather than speculative editor autocomplete. Cancellation is logical because the installed SDK does not expose an abort signal for these calls. Aggregate examples match the current workspace WASM aggregate path; facade proof-capable aggregate transport is a separate SDK/provenance improvement. The workspace reports query context and retrieval time without claiming additional cryptographic verification.

## Validation

Regression tests cover reruns, bounded scheduling, cancellation, SDK replacement, pagination, schema quoting, saved-query isolation/clearing, cross-tab updates before storage-event delivery, storage failures and limits, numeric validation, negative fractional averages, exact export values, generated SDK examples, and structured SDK failures followed by Retry. Validation includes unit tests with coverage, lint, types, and production builds at the root and project base path.

Production-export Chromium tests cover explicit saving, loading without execution, reload persistence, same-origin cross-tab saving/deletion/clearing, network/contract scopes, draft retention, clipboard link reproduction, unsupported SQL, unchanged reruns and cancellation. They use the installed SDK with disclosed HTTP failures; the cancellation test holds actual DAPI requests, including the SDK's prerequisite contract lookup, then fails them. No successful query or proof response is fabricated. Static navigation also asserts that the document and existing header control survive Next's exported text navigation payload.

Live read-only validation in the collaborative browser used trusted testnet, the DPNS contract `GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec`, and `domain` queries filtered to `normalizedParentDomainName == 'dash'`, ordered by `normalizedLabel ASC`. The 25-document preset loaded real schema and results; Next returned a different page and Previous restored the original page. Two statements with limits 2 and 3 returned their respective page sizes; paging the first left the second on page 1. An unchanged rerun reset both to page 1. JSON and CSV export actions produced the current 25-document page, and the SDK example copy action succeeded. Network switching immediately discarded the displayed run. Exact large integer arithmetic/export and late successful responses remain covered by controlled unit fixtures.
