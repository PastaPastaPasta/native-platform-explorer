// Synthetic asset-lock transactions and InstantSend locks for tests. The
// lock's signature is zeros: proofs are parsed and checked locally, never
// verified against a quorum.
import { createHash } from 'node:crypto';
import { parseAssetLockProof, type ParsedAssetLockProof } from '../../forms/identity/asset-lock';

/** hash160 of the compressed public key of private key 0x…01 (and 0x…02). */
export const KEY_1_HASH = '751e76e8199196d454941c45d1b3a323f1433bd6';
export const KEY_2_HASH = '06afd46bcdfd22ef94ac122aa11f241244a37ecc';

const u32 = (n: number) => Buffer.from([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, n >>> 24]);
const u64 = (n: bigint) => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(n);
  return b;
};
const withLength = (b: Uint8Array) => Buffer.concat([Buffer.from([b.length]), b]);

export const p2pkh = (hashHex: string) => Buffer.from(`76a914${hashHex}88ac`, 'hex');

/** A version-3 transaction of `type` (8 is an asset lock) whose payload pays `credits`. */
export function assetLockTx(credits: Uint8Array[], type = 8): Uint8Array {
  const burn = Buffer.from([0x6a, 0x00]); // OP_RETURN
  const payload = Buffer.concat([Buffer.from([1, credits.length]), ...credits.map((s) => Buffer.concat([u64(100_000n), withLength(s)]))]);
  return Buffer.concat([
    u32(3 | (type << 16)),
    Buffer.from([1]), Buffer.alloc(32, 0x11), u32(0), withLength(Buffer.alloc(0)), u32(0xffffffff),
    Buffer.from([1]), u64(100_000n * BigInt(credits.length)), withLength(burn),
    u32(0),
    withLength(payload),
  ]);
}

const sha256d = (b: Uint8Array) => createHash('sha256').update(createHash('sha256').update(b).digest()).digest();

/** The display (byte-reversed) transaction ID. */
export const txidOf = (tx: Uint8Array) => Buffer.from(sha256d(tx)).reverse().toString('hex');

/** An InstantSend lock (version 1) for `tx`, with a zero signature. */
export function instantLockFor(tx: Uint8Array): Uint8Array {
  return Buffer.concat([Buffer.from([1, 1]), Buffer.alloc(36, 7), sha256d(tx), Buffer.alloc(32, 9), Buffer.alloc(96)]);
}

/** A parsed InstantSend proof for credit output `outputIndex` of `tx`. */
export function instantProof(tx: Uint8Array, outputIndex = 0): Promise<ParsedAssetLockProof> {
  return parseAssetLockProof({
    kind: 'instant',
    instantLockHex: Buffer.from(instantLockFor(tx)).toString('hex'),
    transactionHex: Buffer.from(tx).toString('hex'),
    outputIndex: String(outputIndex),
  });
}

/** A parsed chain-lock proof for credit output `outputIndex` of `tx`. */
export function chainProof(tx: Uint8Array, outputIndex = 0): Promise<ParsedAssetLockProof> {
  return parseAssetLockProof({ kind: 'chain', txid: txidOf(tx), outputIndex: String(outputIndex), coreChainLockedHeight: '1579591' });
}

/** A fetch that serves `tx` the way Insight's /rawtx/:txid does. */
export function insightServing(tx: Uint8Array) {
  return async (url: string | URL | Request) => {
    const requested = String(url);
    return requested.endsWith(`/rawtx/${txidOf(tx)}`)
      ? new Response(JSON.stringify({ rawtx: Buffer.from(tx).toString('hex') }), { status: 200 })
      : new Response('Not found', { status: 404 });
  };
}
