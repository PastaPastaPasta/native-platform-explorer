# SDK-compatible local signers

## Problem and boundaries

The installed `@dashevo/evo-sdk` exports asynchronous wallet utilities separately
from each SDK instance. Mnemonic and WIF adapters must use those utilities and
provide `prepareSdk` material for the SDK's write methods. Backup metadata is a
display hint, not proof that an imported private key controls an identity key.

The explorer supports local bridge backups, one mnemonic derivation path, and
single WIF imports. Extension signing and raw-preimage signing are unavailable.
Top-ups require the external bridge; raw-transition and masternode-vote
broadcasting require their originating tools. Operation requirements are declared
centrally in `capabilities.ts` and enforced when implemented executors prepare
signing material. Entries also carry that metadata for the next transaction PR.
The current `OperationShell` does not consume capability metadata; UI capability
gates and binding transaction approval to inputs, signer, identity and SDK session
belong to that next PR. Existing contract and document result links are preserved.

## Key validation and selection

Decode private keys through the pinned SDK and match their actual public data
against enabled on-chain ECDSA keys. Backup imports additionally require the
specified key ID to match. Ignore backup purpose and security declarations when
choosing a signing key. Fetch the identity again when listing keys and preparing
material so disabled or changed keys cannot be selected from an old snapshot.

Select only keys that satisfy the operation's purpose, exact permitted security
levels, and optional explicit ID. Ordinary authentication writes exclude MASTER;
contract updates require CRITICAL, while identity key updates require MASTER.
Credit transfers and withdrawals require CRITICAL TRANSFER keys. A missing match
produces an actionable error rather than a fallback to an unrelated key.

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
destroys the previous one. Live material is released on disconnect, reload/unload, or ten
minutes continuously hidden. JavaScript cannot guarantee erasure of every secret
copy. Session storage contains only the signer kind and public identity ID for a
reconnect hint; blocked storage does not disable in-memory signing.

## Validation

Unit coverage checks SDK wallet calls, actual private/public correspondence,
disabled and ineligible keys, strict selection, release behavior, and stale
connections. Browser tests use the actual locally initialized WASM SDK with
deliberately invalid credentials to verify labels, error recovery, mismatch
blocking, reconnect hints, and draft clearing. They do not sign or broadcast a
transaction. Successful funded-network operation tests remain a separate,
explicitly controlled acceptance activity.
