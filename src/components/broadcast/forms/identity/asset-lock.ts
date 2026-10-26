// Asset-lock proofs pasted by the user. The explorer does not build asset
// locks: the proof comes from a Core wallet (an InstantSend lock with its
// transaction, or a chain-locked outpoint), or as a serialized proof.

import { freeAll } from '@/signer/form-keys';

export type AssetLockProofInput =
  | { kind: 'instant'; instantLockHex: string; transactionHex: string; outputIndex: string }
  | { kind: 'chain'; txid: string; outputIndex: string; coreChainLockedHeight: string }
  | { kind: 'serialized'; text: string };

export interface ParsedAssetLockProof {
  /** The proof serialized by the SDK; executors rebuild it from this. */
  proofHex: string;
  type: string;
  /** "txid:vout" of the asset-lock output. */
  outPoint: string;
  /** The identity an identity create with this proof gets (base58). */
  identityId: string;
}

const HEX = /^(?:[0-9a-f]{2})+$/i;

function hexBytes(text: string, label: string): Uint8Array {
  const clean = text.replace(/\s+/g, '');
  if (!HEX.test(clean)) throw new Error(`${label} must be hex.`);
  return Uint8Array.from(clean.match(/.{2}/g)!, (byte) => parseInt(byte, 16));
}

function index(text: string, label: string, max = 2 ** 32 - 1): number {
  if (!/^\d+$/.test(text.trim())) throw new Error(`${label} must be a whole number.`);
  const value = Number(text.trim());
  if (!Number.isSafeInteger(value) || value > max) throw new Error(`${label} is out of range.`);
  return value;
}

/** Parse and normalise a pasted proof. Throws a readable error on bad input. */
export async function parseAssetLockProof(
  input: AssetLockProofInput,
): Promise<ParsedAssetLockProof> {
  const { AssetLockProof, OutPoint } = await import('@dashevo/evo-sdk');
  let proof: InstanceType<typeof AssetLockProof>;
  try {
    if (input.kind === 'instant') {
      proof = AssetLockProof.createInstantAssetLockProof(
        hexBytes(input.instantLockHex, 'The InstantSend lock'),
        hexBytes(input.transactionHex, 'The transaction'),
        index(input.outputIndex, 'The output index'),
      );
    } else if (input.kind === 'chain') {
      const txid = input.txid.trim().toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(txid))
        throw new Error('The transaction ID must be 64 hex characters.');
      const outPoint = new OutPoint(txid, index(input.outputIndex, 'The output index'));
      try {
        proof = AssetLockProof.createChainAssetLockProof(
          index(input.coreChainLockedHeight, 'The chain-locked height'),
          outPoint,
        );
      } finally {
        freeAll(outPoint);
      }
    } else {
      const text = input.text.trim();
      proof = text.startsWith('{')
        ? AssetLockProof.fromJSON(JSON.parse(text))
        : AssetLockProof.fromHex(text.replace(/\s+/g, ''));
    }
  } catch (error) {
    // Keep the field-level messages above; SDK and JSON parser errors are not helpful here.
    throw error instanceof Error && error.message.startsWith('The ')
      ? error
      : new Error('That is not a valid asset-lock proof.');
  }
  try {
    const outPoint = proof.outPoint;
    const identity = proof.createIdentityId();
    try {
      return {
        proofHex: proof.toHex(),
        type: proof.lockType,
        outPoint: outPoint ? `${outPoint.txid}:${outPoint.vout}` : 'unknown',
        identityId: identity.toBase58(),
      };
    } finally {
      freeAll(outPoint, identity);
    }
  } finally {
    freeAll(proof);
  }
}
