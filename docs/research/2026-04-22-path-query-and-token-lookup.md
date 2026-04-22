# Path query & token→contract lookup — findings and plan

> _2026-04-22 — research note._ The Dash Platform lead maintainer flagged two
> explorer gaps in conversation:
>
> 1. we can’t list all identities / contracts / tokens, and he thought the
>    raw **path query** primitive could fix that;
> 2. he implied you could go from a **token ID alone** to the owning contract.
>
> This doc records what those two ideas look like once the code is actually
> read, and the plan for what to land in this repo now.

## 1. `getPathElements` — what it actually is

The raw primitive the maintainer was pointing at is exposed in
`@dashevo/evo-sdk`:

```ts
sdk.system.pathElements(path: string[], keys: string[]): Promise<PathElement[]>
sdk.system.pathElementsWithProof(path: string[], keys: string[]):
  Promise<ProofMetadataResponseTyped<PathElement[]>>
```

Under the hood, in `packages/wasm-sdk/src/queries/system.rs` (`get_path_elements`),
the implementation is:

```rust
let query = KeysInPath { path: path_bytes, keys: key_bytes };
let path_elements_result: Elements = Element::fetch_many(self.as_ref(), query).await?;
for key in keys { elements_array.push(PathElementWasm::new(vec![key], …)); }
```

That is a GroveDB **`KeysInPath`** query — a batched point-get. It takes the
keys you want up front, returns only those keys, and has **no range / scan /
enumeration mode**. Passing `keys=[]` returns `[]`. The `PathQuery` +
`SizedQuery { limit, offset }` + `QueryItem::{Range*, All}` + subquery
machinery that would make enumeration possible lives in
`packages/rs-drive/src/query/`, but it is **not** surfaced in
`@dashevo/wasm-sdk@3.1.0-dev.1` at all.

Encoding trap: every `path` and `keys` string is `as_bytes()`-ed on the Rust
side. A numeric decimal string (`"32"`) is parsed as a `u8` first, so
`RootTree::Identities` is written `"32"`. Anything else is taken as UTF-8
bytes. `wasm-bindgen`’s `passStringToWasm0` re-encodes the JS string as
UTF-8, which means **binary 32-byte identifiers cannot be passed as keys
reliably** — a JS code point ≥ 0x80 becomes a 2-byte UTF-8 sequence, not a
single byte. The current JS wrapper is only usable with ASCII-safe keys.

### GroveDB layout we care about

From `packages/rs-drive/src/drive/mod.rs` (`RootTree` enum, `#[repr(u8)]`):

| Variant                                   | Byte |
| ----------------------------------------- | ---- |
| `NonUniquePublicKeyKeyHashesToIdentities` | 8    |
| `Tokens`                                  | 16   |
| `UniquePublicKeyHashesToIdentities`       | 24   |
| `Identities`                              | 32   |
| `PreFundedSpecializedBalances`            | 40   |
| `Pools`                                   | 48   |
| `AddressBalances`                         | 56   |
| `DataContractDocuments`                   | 64   |
| `WithdrawalTransactions`                  | 80   |
| `GroupActions`                            | 88   |
| `Balances`                                | 96   |
| `Misc`                                    | 104  |
| `Votes`                                   | 112  |
| `Versions`                                | 120  |

Token subtree (`RootTree::Tokens = 16`, from `drive/tokens/paths.rs`):

| Subkey                            | Byte |
| --------------------------------- | ---- |
| `TOKEN_DISTRIBUTIONS_KEY`         | 32   |
| `TOKEN_STATUS_INFO_KEY`           | 64   |
| `TOKEN_DIRECT_SELL_PRICE_KEY`     | 92   |
| `TOKEN_BALANCES_KEY`              | 128  |
| **`TOKEN_CONTRACT_INFO_KEY`**     | 160  |
| `TOKEN_IDENTITY_INFO_KEY`         | 192  |

### Answers to the four questions

1. **Enumerate all identities** — ❌ not possible with `getPathElements`.
   Would conceptually be "children of `[[32]]`", but `KeysInPath` doesn’t
   enumerate.
2. **Enumerate all data contracts** — ❌ same reason.
3. **Enumerate all tokens** — ❌ same reason. The candidate enumeration
   points would be `[[16], [160]]` (token-contract-infos) or
   `[[104], b"T"]` (per-token supply under `Misc`). No enumeration
   primitive exists.
4. **token_id → (contract_id, position)** — ✅ one point-get at
   `path=[[16], [160]], keys=[token_id]`, value is a bincode
   `TokenContractInfo { contract_id: 32b, token_contract_position: u16 }`.
   But the JS encoding issue in §1 means the wrapper is unusable for
   binary keys today — **use the typed endpoint instead** (§2).

So the path-query idea solves problem (2) — token lookup — but **not** the
enumeration problem. For enumeration we need either an upstream wasm-sdk
patch that exposes `prove_query`/`PathQuery`, or an off-chain indexer.

## 2. token ID → owning contract — already wired, mis-named

`WasmSdk.getTokenContractInfo(tokenId)` hits the platform gRPC
`getTokenContractInfo` endpoint (`GetTokenContractInfoRequestV0 { token_id
}`), which in `rs-drive-abci`’s `token_queries/token_contract_info/v0`
reads the GroveDB path in §1 and returns `{ contract_id,
token_contract_position }`.

The wasm-sdk’s JS signature names the parameter **`dataContractId`** —
that’s a bug/misnomer. Pass a **token ID** and it works: the underlying
Rust binding stuffs the argument into `GetTokenContractInfoRequestV0.token_id`.
Source:

```
packages/wasm-sdk/src/queries/token.rs
  get_token_contract_info(&self, dataContractId: IdentifierLikeJs)
    -> TokenContractInfo::fetch(self.as_ref(), contract_id).await
```

and `impl Query<GetTokenContractInfoRequest> for Identifier` in
`packages/rs-sdk/src/platform/tokens/token_contract_info.rs` puts that
`Identifier` straight into the `token_id` field.

The explorer’s existing `useTokenContractInfo(contractId)` hook therefore
**always returns nothing** when called with a contract ID on the contract
page (`src/app/contract/page.tsx:54`). Fixing that misuse, and using the
method as the token-side resolver, is the whole unlock for "view a token
from only its ID".

## 3. Plan landed in this change

### Enabled

- **Rename & re-purpose** `useTokenContractInfo` to take a `tokenId`.
  Typed return as `{ contractId, tokenContractPosition } | null`.
- **Enrich `TokenView`**: call the hook, then chain `useContract(contractId)`
  when we have it, pull `contract.tokens[position]` for name / decimals /
  base-supply / distribution rules / permissioning, and surface all of it
  on `TokenDigestCard` plus a new "Definition" tab. Proof state aggregates
  across both hops.
- **Add `system.pathElements` to the query layer** (`usePathElements`) with
  an honest docstring: it’s KeysInPath, not a scan, and only safe for
  ASCII-keyed paths today.
- **New `/tools/path-elements` page**: raw debug surface for the primitive
  with seeded presets for the well-known system paths. Useful for us and
  honest about the limits.
- **Remove the broken `useTokenContractInfo` call from the contract page**,
  and enrich the contract Tokens tab with the **derived token ID** for each
  position (via `sdk.tokens.calculateId(contractId, position)`) so users can
  click through to `/token/?id=…`.

### Deferred — needs an upstream change

Listing all identities / contracts / tokens requires one of:

- A `prove_query` / `PathQuery` binding in `@dashevo/wasm-sdk` (range +
  sized + subquery), with a JS encoding for 32-byte binary keys that
  round-trips (hex or base64 accepted explicitly, not UTF-8). Filing this
  upstream is the right move; it’s a one-module addition next to the
  existing `get_path_elements`.
- Or a lightweight indexer, which this explorer explicitly opts out of
  having.

Until then, the landings stay honest about the constraint and redirect to
seeded lookups; the new path-elements tool lets curious users see why.
