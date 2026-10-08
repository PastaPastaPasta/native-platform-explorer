# Explicit epoch queries and bounded history

The explorer was passing `{ startIndex: 42, endIndex: 42 }` to Evo SDK
4.0.0-rc.2. Its published input is `{ startEpoch, count, ascending }`. The
`as never` casts hid that mismatch from TypeScript. The WASM parser silently
ignored the unknown properties, so a request for epoch 42 became the default
ascending 100-epoch request from epoch zero. Finalized queries rejected the
missing required `startEpoch` before transport.

## Live diagnosis

Read-only calls against mainnet reproduced the browser error through both
`epochsInfoWithProof` and ordinary `epochsInfo`: HTTP 200 gRPC-Web responses
failed with `WasmSdkError`, kind `Proof` (4), code -1, and message
`grovedb: data corruption error: unable to decode proof: Other("proof layer has too many children")`.

The captured V1 proof contained 160 immediate child layers. The pinned decoder
limits that width to 128. Epoch proofs budget five leaf values per requested
epoch; the 100-epoch request used a budget of 500. Epochs 0–84 contained 425
requested metadata values, epoch 85 contained one, and 74 initialized empty
future epochs consumed the remaining budget. That walks 160 epoch subtrees.
The complete serialized envelope decoded structurally; a wire-format mismatch
was not needed to explain this error.

The same pinned SDK verified explicit `{ startEpoch: 42, count: 1, ascending:
true }` detail and finalized calls. An explicit 10-epoch range returned exactly
40–49. Separate 20-, 32-, 64-, and 65-epoch probes also succeeded, but pagination
uses a conservative ten epochs per request rather than relying on that larger
observed bound. These observations were made on 2026-10-07, at mainnet height
447872, with live protocol 13 and DAPI/Drive software 4.1.1 or 4.1.2.

## Design

- Input types come from the installed Evo SDK facade signatures. Detail and
  finalized queries explicitly request one epoch. Invalid fractional,
  negative, or out-of-range indexes do not launch SDK requests, including
  manual refetch. The public maximum is 65279: Platform stores an epoch at its
  index plus 256 in a uint16 key space, reserving those earlier keys for other
  credit-pool state.
- History requests the inclusive range in sequential batches of at most ten,
  including a shorter final batch. Empty pages do not end a requested range.
  The UI allows at most 200 epochs, limiting one history read to twenty calls.
- Every batch checks the query/session execution boundary before and after
  its SDK await. Retiring a session discards an outstanding result and stops
  subsequent batches. Any batch failure rejects the entire aggregate.
- History uses ordinary SDK calls, which still verify proofs in trusted mode.
  The inspector stores the completed result, requested span, actual batch
  parameters (labelled as planned batches), and an explicit capture-limit note
  on success. An error does not claim a completed verified aggregate. It
  attaches neither a single batch's proof nor one batch's metadata/height to
  the aggregate. This is not a snapshot at one height or an export containing
  all of the constituent proof bytes. Single detail/finalized calls continue
  capturing their original proof envelopes.
- The detail view selects the requested map key instead of the first returned
  value. History validates the range visibly and waits for the current-epoch
  query before choosing its default 20-epoch range.

## SDK version decision and limits

This fix keeps 4.0.0-rc.2 and does not disable verification or retry a
cryptographic failure through an unverified transport. An isolated comparison
with stable 4.1.1 reproduced the same broad-proof failure; upgrading alone is
not a fix. GroveDB PR 944 raises the width limit in later 4.2 beta packages,
but that larger SDK migration needs its own validation.

Stable 4.1.1 also intentionally rejects the implicit-current proof helper:
unsigned response metadata cannot safely select an epoch bound. The existing
pinned helper succeeds, but this does not establish authenticated freshness of
the current epoch. Explicit epoch verification and freshness of the latest
epoch are separate properties. A future SDK migration must account for this
upstream hardening rather than weakening it; this change does not alter the
current-epoch helper.

Sources: [SDK query parser](https://github.com/dashpay/platform/blob/v4.0.0-rc.2/packages/wasm-sdk/src/queries/epoch.rs),
[public epoch bounds](https://github.com/dashpay/platform/blob/v4.0.0-rc.2/packages/rs-dpp/src/block/epoch/mod.rs#L5-L12),
[SDK defaults](https://github.com/dashpay/platform/blob/v4.0.0-rc.2/packages/rs-sdk/src/platform/query.rs#L464-L480),
[epoch proof leaf budget](https://github.com/dashpay/platform/blob/v4.0.0-rc.2/packages/rs-drive/src/drive/credit_pools/epochs/prove_epochs_infos/v0/mod.rs#L38-L60),
[decoder bound](https://github.com/dashpay/grovedb/blob/fc814983d4d36c6ea049642556b9a31ab8d4dfaa/grovedb/src/operations/proof/mod.rs#L243-L257),
[current-epoch hardening](https://github.com/dashpay/platform/pull/4166),
[later proof-width change](https://github.com/dashpay/grovedb/pull/944).
