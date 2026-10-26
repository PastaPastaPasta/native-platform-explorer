// Execution for operations signed with keys entered in their form. Like
// withSigningMaterial: every failure before `submit` is "not submitted", every
// failure once `submit` starts is "outcome unknown", and the WASM key material
// registered with `onRelease` is freed whatever happens.

import type { AssetLockProof, EvoSDK } from '@dashevo/evo-sdk';
import { assertWritableProtocolVersion } from '@sdk/protocol-version';
import { freeAll } from '@/signer/form-keys';
import {
  BroadcastOutcomeUnknownError,
  OperationNotSubmittedError,
  submitOperation,
  type ReceiptEntities,
} from '../outcomes';

export type OnRelease = (release: () => void) => void;

/**
 * `sdk` is the session the operation builds with: its protocol version is
 * checked against the network's first, as for identity-signed writes. Pass
 * null when nothing is built here (a transition signed elsewhere).
 */
export async function executeFormSigned<T>(
  sdk: EvoSDK | null,
  fn: (submit: typeof submitOperation, onRelease: OnRelease) => Promise<T>,
): Promise<T> {
  const releases: (() => void)[] = [];
  let submitted: ReceiptEntities | null = null;
  const submit: typeof submitOperation = async (write, entities, assertCurrent) => {
    // A stale session fails here, before anything counts as submitted.
    assertCurrent?.();
    submitted = entities;
    return submitOperation(write, entities);
  };
  try {
    if (sdk) await assertWritableProtocolVersion(sdk);
    return await fn(submit, (release) => releases.push(release));
  } catch (error) {
    if (
      error instanceof BroadcastOutcomeUnknownError ||
      error instanceof OperationNotSubmittedError
    )
      throw error;
    if (submitted) throw new BroadcastOutcomeUnknownError(error, submitted);
    throw new OperationNotSubmittedError(error);
  } finally {
    for (const release of releases.reverse()) {
      try {
        release();
      } catch {
        /* best-effort */
      }
    }
  }
}

/** The reviewed asset-lock proof as a WASM object, freed with the operation. */
export async function loadAssetLockProof(
  proofHex: string,
  onRelease: OnRelease,
): Promise<AssetLockProof> {
  const { AssetLockProof } = await import('@dashevo/evo-sdk');
  const proof = AssetLockProof.fromHex(proofHex);
  onRelease(() => freeAll(proof));
  return proof;
}
