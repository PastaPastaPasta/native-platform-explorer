# SDK-compatible local signers

## Problem and boundaries

The installed `@dashevo/evo-sdk` exports asynchronous wallet utilities separately
from each SDK instance. Mnemonic and WIF adapters must use those utilities and
provide `prepareSdk` material for the SDK's write methods. Backup metadata is a
display hint, not proof that an imported private key controls an identity key.

The explorer supports local bridge backups, one mnemonic derivation path, and
single WIF imports. Extension signing and raw-preimage signing are unavailable.
(Since #47, asset-lock top-ups and identity creation, masternode votes and
raw-transition broadcast are available as form-signed operations: their keys
are entered in the form rather than taken from a connected signer. The bridge
remains the path for users without a Core wallet.) Operation requirements are declared
centrally in `capabilities.ts` and enforced when implemented executors prepare
signing material. Entries also carry that metadata for the next transaction PR.
(That PR, #27, made `OperationShell` consume capability metadata and bind
approval to inputs, signer, identity and SDK session.) Existing contract and document result links are preserved.

## Key validation and selection

Decode private keys through the pinned SDK and match their actual public data
against enabled on-chain ECDSA keys. Backup imports additionally require the
specified key ID to match. Ignore backup purpose and security declarations when
choosing a signing key. Fetch the identity again when listing keys and preparing
material so disabled or changed keys cannot be selected from an old snapshot.

Select only keys that satisfy the operation's purpose, exact permitted security
levels, contract bounds, and optional explicit ID. `resolveSigningCriteria`
narrows each operation's declared requirement for its inputs, and both executors
and the review step use it. Contract registration and DPNS registration accept
CRITICAL or HIGH; contract updates require CRITICAL, while identity key updates
require MASTER. Document operations accept CRITICAL through the document type's
`signatureSecurityLevelRequirement` (default HIGH), or only MASTER when the type
requires it. A contract-bound key qualifies only for its contract (and document
type), never for operations without that target. Token operations require CRITICAL
AUTHENTICATION keys, or CRITICAL TRANSFER keys for a single transfer or claim
(#48). Credit transfers require
CRITICAL TRANSFER keys; withdrawals to an address require CRITICAL TRANSFER keys,
and withdrawals to a masternode payout address require the CRITICAL OWNER key.
Capability previews ignore contract bounds because the target is not known yet.
A missing match produces an actionable error rather than a fallback to an
unrelated key.

`prepareSdk` returns the selected public key and SDK identity signer, with an
idempotent release function for their owned WASM allocations. Private byte arrays
are owned by the local adapter and cleared on initialization failure or destroy.

## Import and session lifecycle

Every import requires a ready SDK. A backup declaring a different network remains
a preview until the user switches networks. Editing JSON invalidates its preview
immediately; asynchronous file reads have a generation guard so a discarded or
edited draft cannot return later. Importing disables draft edits, and all import
attempts clear credential fields and backup previews when they finish.

Pending connections are rejected and destroyed after disconnect, provider
unmount, or a changed SDK/network/trust context. A completed import must also
match its captured session ID and still-active abort signal before it can become
the signer, including before React commits a network change. Replacing a signer
destroys the previous one. Adapter-owned private byte arrays are cleared on
disconnect, reload/unload, ten minutes without pointer, keyboard, wheel, or touch
input (visible or hidden; throttled background timers are rechecked when the tab
becomes visible), or navigation away from `/wallet` and `/broadcast`. Automatic
clears keep the public reconnect hint; explicit disconnects remove it. Owner-gated
shortcuts on identity, contract, and document pages match that hint, since the
live signer is cleared there; the broadcast console still requires a live signer. Signing material
already returned to an executor owns a separate WASM copy and is released when
that operation settles; disconnect does not cancel an in-flight operation in this
PR. JavaScript cannot guarantee erasure of every secret copy. Session storage
contains only the signer kind, public identity ID and network for a
reconnect hint (ignored on other networks); blocked storage does not disable in-memory signing.

## Validation

Unit coverage checks SDK wallet calls, actual private/public correspondence,
disabled and ineligible keys, strict selection, release behavior, and stale
connections. Browser tests use the actual locally initialized WASM SDK with
deliberately invalid credentials to verify labels, error recovery, mismatch
blocking, reconnect hints, and draft clearing. They do not sign or broadcast a
transaction. Successful funded-network operation tests remain a separate,
explicitly controlled acceptance activity.
