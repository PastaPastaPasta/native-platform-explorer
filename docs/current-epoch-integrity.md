# Current epoch integrity

The pinned `@dashevo/evo-sdk` 4.0.0-rc.2 implicit current-epoch verifier uses
response `metadata.epoch` as its GroveDB query bound. That field is outside the
Tenderdash-signed state identifier. A transport that supplies a valid historical
epoch proof from a current signed root can change only this field and cause the
implicit method to accept the historical record as current. This is a Low
severity explorer data-integrity issue; it does not forge signatures or alter
the chain.

`src/sdk/current-epoch.ts` avoids that unsigned hint. In trusted mode it reads
explicit epoch zero with native proof verification, obtains its persisted start
time, and derives the expected current index from the response's signed
`metadata.timeMs`. It then verifies an explicit ascending query at that index
and checks the returned epoch against the final response's signed time. A
bounded retry handles epoch rollover. Proof failures propagate without an
ordinary-read or implicit-current fallback.

The derivation also depends on supported network deployment configuration:
Mainnet uses 788400 seconds per epoch; Testnet uses 3600 seconds. These values
come from pinned Platform/Dashmate configuration, not a cryptographically
discovered configuration field. An unknown custom devnet duration fails closed;
users can still browse an explicit epoch.

Trusted mode succeeded in two finite live Testnet checks, each selecting epoch
19454 through exactly two explicit proved reads, epoch zero then 19454. Some
other discovered endpoints returned gRPC status 12 before proof verification.
These observations establish the helper's operation on those reachable
endpoints, without a network-wide availability guarantee. Passing and failing
endpoints used the same unchanged RPC path, so these failures do not establish
a URL-normalization cause. With this SDK, trusted context discovery replaces
an address list supplied through `withAddresses`; that call does not pin the
trusted endpoint.

The trusted-off branch attempts ordinary explicit queries and would use the
local clock after a successful genesis read, retaining an unverified status.
Actual Mainnet controls with this pinned WASM SDK fail on that initial read:
the ordinary API still requests a proof, then cannot verify it without trusted
quorum context. No successful trusted-off epoch result was observed. Enable
trusted mode to provide the context required by the pinned SDK. Proof errors
propagate without disabling verification, attaching context under an
unverified label, or falling back to an implicit current query.

This establishes **currentness at the authenticated response state/time**. It
does not establish that a signed root is the newest network state. Replaying an
older fully signed state is a separate freshness question. The helper retains
no genesis response cache across sessions or networks.

## Actual SDK transport regression

After installing the repository's pinned dependencies, run with Node 22.13 or
later (for `node:module`'s `stripTypeScriptTypes`):

```sh
node scripts/replay-current-epoch.mjs
```

The script creates an evidence directory under the system temporary directory.
To select a directory **outside the product worktree**:

```sh
NPE_EPOCH_REPLAY_OUTPUT=/tmp/npe-epoch-replay node scripts/replay-current-epoch.mjs
```

This is a network-dependent, read-only regression rather than a mocked unit
test. It imports the actual SDK public export, obtains actual trusted quorum
context, captures fresh Mainnet responses, and loads the actual TypeScript
helper and its epoch-query dependency by stripping types into data URLs. It
does not replace the helper, native verification, context lookups, or SDK
results. The only intercepted RPC is the read-only epoch-info transport.
SDK connection/query timeouts are bounded and retries are disabled.

Assertions cover:

- Native acceptance of explicit epoch zero, historical epoch 42, and a live
  current control; the helper returns the index derived from signed time.
- The old implicit current method accepts epoch 42 when only unsigned
  `metadata.epoch` is changed; its unmodified historical-proof control rejects.
- The actual helper ignores the same metadata change: it requests explicit
  epoch zero and the derived current index, and native explicit-query verification
  rejects the historical epoch-42 proof.
- The actual helper rejects a corrupted 96-byte signature and a one-millisecond
  change to signed `timeMs`; an unknown devnet fails before making a request.
- Decoded transport requests have the expected explicit bounds, count,
  ascending direction and proof flag. Metadata-only attacks preserve the
  **entire proof, signature, all other metadata fields and gRPC trailers**.

Raw response `.bin` files, hashes, transport records and probe outcomes are
written to `results.json`. A successful run writes `verification.json` and
exits zero. A live outage, incompatible SDK/helper change, or failed control
exits nonzero; it must not be described as successful confirmation. The current
epoch is computed from the captured signed time, so the regression does not
hardcode the current epoch as 84. It requires epoch 42 to remain historical.

The epoch formula and duration assumptions were checked against Platform tag
`v4.0.0-rc.2` (`1ba1ca582882a04cdbeffb834d129c15c7d6cfe9`):
`epoch_info/v0/mod.rs` computes elapsed time divided by the configured epoch
duration; `genesis_time/mod.rs` reads the epoch-zero start; Dashmate's
`getBaseConfigFactory.js` and `getTestnetConfigFactory.js` supply the deployed
durations. Native response verification includes `time_ms` in the Tenderdash
state identifier and does not include `epoch`.
