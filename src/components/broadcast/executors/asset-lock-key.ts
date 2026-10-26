// Before an asset-lock create, top-up or fund is submitted, check that the
// one-time key from the form controls the asset-lock output. Platform checks
// the transition's signature against that output's public key hash, so a wrong
// key is otherwise only rejected after submission.

import type { AssetLockProof, PrivateKey } from '@dashevo/evo-sdk';
import { getNetwork } from '@sdk/networks';
import { freeAll, withPrivateKey } from '@/signer/form-keys';
import { bytesToHex, hexToBytes } from '@util/hex';

/** DIP-2 special transaction type of an asset lock. */
const ASSET_LOCK_TX_TYPE = 8;
const FETCH_TIMEOUT_MS = 15_000;

class TxReader {
  private offset = 0;
  constructor(private readonly bytes: Uint8Array) {}
  take(length: number): Uint8Array {
    if (this.offset + length > this.bytes.length)
      throw new Error('The asset-lock transaction is truncated.');
    const out = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;
    return out;
  }
  uint(length: 1 | 2 | 4 | 8): number {
    const bytes = this.take(length);
    let value = 0;
    for (let i = length - 1; i >= 0; i--) value = value * 256 + bytes[i]!;
    return value;
  }
  /** Bitcoin CompactSize. */
  varint(): number {
    const first = this.uint(1);
    if (first < 0xfd) return first;
    return this.uint(first === 0xfd ? 2 : first === 0xfe ? 4 : 8);
  }
  bytesWithLength(): Uint8Array {
    return this.take(this.varint());
  }
  get done(): boolean {
    return this.offset === this.bytes.length;
  }
}

/**
 * The scripts of an asset-lock transaction's credit outputs, in order. A
 * proof's output index counts these outputs of the special-transaction
 * payload, not the transaction's ordinary outputs (which burn the amount).
 */
export function assetLockCreditScripts(tx: Uint8Array): Uint8Array[] {
  const reader = new TxReader(tx);
  const versionAndType = reader.uint(4);
  const version = versionAndType & 0xffff;
  const type = versionAndType >>> 16;
  if (version < 3 || type !== ASSET_LOCK_TX_TYPE)
    throw new Error('The asset-lock proof\'s transaction is not an asset-lock transaction.');
  const inputs = reader.varint();
  for (let i = 0; i < inputs; i++) {
    reader.take(36); // previous outpoint
    reader.bytesWithLength(); // script
    reader.take(4); // sequence
  }
  const outputs = reader.varint();
  for (let i = 0; i < outputs; i++) {
    reader.take(8);
    reader.bytesWithLength();
  }
  reader.take(4); // lock time
  const payload = new TxReader(reader.bytesWithLength());
  if (!reader.done) throw new Error('The asset-lock transaction has trailing bytes.');
  payload.uint(1); // payload version
  const credits = payload.varint();
  const scripts: Uint8Array[] = [];
  for (let i = 0; i < credits; i++) {
    payload.take(8);
    scripts.push(payload.bytesWithLength());
  }
  return scripts;
}

/** The 20-byte key hash (hex) a P2PKH script pays, or null for any other script. */
export function p2pkhKeyHash(script: Uint8Array): string | null {
  const isP2pkh = script.length === 25 && script[0] === 0x76 && script[1] === 0xa9
    && script[2] === 0x14 && script[23] === 0x88 && script[24] === 0xac;
  return isP2pkh ? bytesToHex(script.subarray(3, 23)) : null;
}

/** Core's transaction ID: double SHA-256 of the bytes, shown byte-reversed. */
async function txidOf(tx: Uint8Array): Promise<string> {
  const once = await crypto.subtle.digest('SHA-256', tx as BufferSource);
  const twice = new Uint8Array(await crypto.subtle.digest('SHA-256', once));
  return bytesToHex(twice.reverse());
}

/**
 * A chain-lock proof names only the outpoint, so its transaction comes from
 * the network's Insight API. The bytes must hash to the outpoint's txid, so
 * Insight cannot substitute another transaction.
 */
async function fetchTransaction(txid: string, network: string, fetchImpl: typeof fetch): Promise<Uint8Array> {
  const insight = getNetwork(network).insightApiUrl;
  if (!insight)
    throw new Error(
      'This network has no Insight API to fetch the chain-locked asset-lock transaction from, so the key cannot be checked. Use an InstantSend proof, which includes the transaction.',
    );
  let rawtx: unknown;
  try {
    const response = await fetchImpl(`${insight.replace(/\/+$/, '')}/rawtx/${txid}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    rawtx = ((await response.json()) as { rawtx?: unknown }).rawtx;
  } catch (error) {
    throw new Error(
      `Could not fetch asset-lock transaction ${txid} from Insight to check the key (${error instanceof Error ? error.message : String(error)}). Try again, or use an InstantSend proof.`,
    );
  }
  if (typeof rawtx !== 'string' || !/^(?:[0-9a-f]{2})+$/i.test(rawtx))
    throw new Error(`Insight returned no transaction for ${txid}.`);
  const tx = hexToBytes(rawtx);
  if ((await txidOf(tx)) !== txid.toLowerCase())
    throw new Error(`Insight returned a transaction that does not hash to ${txid}.`);
  return tx;
}

/**
 * Throws unless `key` controls the output the proof locks. Call it before
 * submission, so a mismatch is "not submitted". `network` is the explorer
 * network (for chain-lock proofs, whose transaction is fetched).
 */
export async function assertAssetLockKey(
  proof: AssetLockProof,
  key: PrivateKey,
  network: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  let tx: Uint8Array;
  let outputIndex: number;
  // Reading the other lock type's getter traps the WASM module.
  if (proof.lockType === 'instant') {
    const instant = proof.instantLockProof;
    try {
      tx = instant.transaction;
      outputIndex = instant.outputIndex;
    } finally {
      freeAll(instant);
    }
  } else {
    const outPoint = proof.outPoint;
    if (!outPoint) throw new Error('The asset-lock proof has no outpoint.');
    let txid: string;
    try {
      txid = outPoint.txid;
      outputIndex = outPoint.vout;
    } finally {
      freeAll(outPoint);
    }
    tx = await fetchTransaction(txid, network, fetchImpl);
  }
  const script = assetLockCreditScripts(tx)[outputIndex];
  if (!script) throw new Error(`The asset-lock transaction has no credit output ${outputIndex}.`);
  const keyHash = p2pkhKeyHash(script);
  if (!keyHash)
    throw new Error('The asset-lock output is not a pay-to-public-key-hash output, so no single key controls it.');
  if (keyHash !== key.getPublicKeyHash().toLowerCase())
    throw new Error(
      'The asset-lock private key does not control the asset-lock output. Enter the one-time key the asset-lock transaction pays, not a wallet or identity key.',
    );
}

/**
 * Load the form's asset-lock private key and check it controls the proof's
 * locked output before `fn` builds the write, so a wrong key fails as not
 * submitted. `explorerNetwork` (a devnet name included) picks the Insight API;
 * `network` is the key's mainnet/testnet encoding and the fallback.
 */
export function withAssetLockKey<T>(
  wif: string,
  proof: AssetLockProof,
  { network, explorerNetwork }: { network: 'mainnet' | 'testnet'; explorerNetwork?: string },
  fn: (key: PrivateKey) => Promise<T>,
): Promise<T> {
  return withPrivateKey(wif, network, 'asset-lock private key', async (key) => {
    await assertAssetLockKey(proof, key, explorerNetwork ?? network);
    return fn(key);
  });
}
