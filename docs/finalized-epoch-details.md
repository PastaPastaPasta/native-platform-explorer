# Historical epoch detail data

The detail page queries ordinary epoch metadata and finalized epoch records independently with the existing explicit SDK input (`startEpoch`, `count: 1`, `ascending: true`). It keeps their normalized values separate: one response does not supply a combined proof or response height for the whole screen. The query inspector retains the individual sources.

Either record can supply the header. Pending SDK startup and partial query failures do not establish absence; `Epoch not found` requires both sources to succeed without the requested record. Metadata and finalized errors have independent Retry actions. Finalized proposer maps take precedence, including an empty map; live proposer queries run only after a successful finalized lookup returns no record.

Finalized monetary fields are raw integer **credits**, displayed without conversion through JavaScript `Number`:

- Processing fees: `totalProcessingFees`.
- Storage fees distributed: `totalDistributedStorageFees`.
- Storage fees created: `totalCreatedStorageFees`.
- Core block rewards: `coreBlockRewards` (Platform's share of Core subsidy).

These categories are distinct flows and are not summed into a fabricated aggregate. Created storage fees describe the storage distribution pool recorded at rollover, not necessarily fees generated exclusively within that finalized epoch. The pinned producer attributes this pool to the oldest unpaid epoch and the input precedes refund/leftover adjustment. Native finalized records have no epoch index or end timestamp; the requested Map key supplies the index, and the UI does not infer an end time or progress from Core heights.

A present finalized record remains immutable in cache. A successful empty lookup remains live: a mounted page checks again every 30 seconds while visible, allowing an unfinalized epoch to acquire its finalized totals and switch proposer sources. Existing network/session cancellation and proof transport policy are unchanged.

Source semantics are verified against Platform `v4.0.0-rc.2`, commit `1ba1ca582882a04cdbeffb834d129c15c7d6cfe9`: [native record and credit types](https://github.com/dashpay/platform/blob/1ba1ca582882a04cdbeffb834d129c15c7d6cfe9/packages/rs-dpp/src/block/finalized_epoch_info/v0/mod.rs), [record producer](https://github.com/dashpay/platform/blob/1ba1ca582882a04cdbeffb834d129c15c7d6cfe9/packages/rs-drive-abci/src/execution/platform_events/fee_pool_outwards_distribution/add_distribute_fees_from_oldest_unpaid_epoch_pool_to_proposers_operations/v1/mod.rs), and [Wasm getters](https://github.com/dashpay/platform/blob/1ba1ca582882a04cdbeffb834d129c15c7d6cfe9/packages/wasm-dpp2/src/epoch/finalized_epoch_info.rs).

Offline native SDK tests validate prototype getters, Base58 proposer keys, zero credit values, amounts above `Number.MAX_SAFE_INTEGER`, index zero, and no invented timestamp/aggregate. UI regressions validate independent source timing/errors/retries, finalized empty-map precedence, and live fallback. These offline tests make no transport or cryptographic-verification claims.
