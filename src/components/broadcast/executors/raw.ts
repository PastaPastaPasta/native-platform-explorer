// Broadcast of a transition signed elsewhere. The bytes are decoded locally
// and broadcast unchanged; DAPI reports a transition it already holds as
// "already in mempool/chain", which is not a failure: the result is awaited
// the same way.

import { freeAll } from '@/signer/form-keys';
import type { ExecuteArgs } from '../executors';
import { decodeStateTransition } from '../forms/raw/decode';
import type { RawBroadcastOptions } from '../forms/raw/RawBroadcast';
import { BroadcastOutcomeUnknownError } from '../outcomes';
import { executeFormSigned } from './form-signed';

export interface RawBroadcastResult {
  kind: 'raw';
  message: string;
  stateTransitionHash: string;
  type: string;
  identityId?: string;
  /** Whether this broadcast was accepted, or DAPI already held the transition. */
  broadcast: 'accepted' | 'already-known';
  /** Whether the proof shows this transition executed, or only the state it affects. */
  proof: 'execution' | 'affected-state';
  result: unknown;
}

/** A WASM SDK error of `kind` (they are plain objects, not Errors). */
function isSdkError(error: unknown, kind: string): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    !(error instanceof Error) &&
    (error as { name?: unknown }).name === kind
  );
}

function plain(value: unknown): unknown {
  const json = (value as { toJSON?: () => unknown } | null)?.toJSON;
  return typeof json === 'function' ? json.call(value) : value;
}

export async function executeRawBroadcast({
  sdk,
  options,
  assertCurrent,
}: ExecuteArgs<RawBroadcastOptions>): Promise<RawBroadcastResult> {
  return executeFormSigned(async (submit, onRelease) => {
    const reviewed = options.transition;
    const decoded = await decodeStateTransition(reviewed.hex);
    if (decoded.hash !== reviewed.hash) throw new Error('The transition changed after review.');
    const { StateTransition } = await import('@dashevo/evo-sdk');
    const transition = StateTransition.fromHex(decoded.hex);
    onRelease(() => freeAll(transition));
    const entities = decoded.ownerId ? { identityId: decoded.ownerId } : {};

    const broadcast = await submit(
      async () => {
        try {
          await sdk.stateTransitions.broadcastStateTransition(transition);
          return 'accepted' as const;
        } catch (error) {
          if (isSdkError(error, 'AlreadyExists')) return 'already-known' as const;
          throw error;
        }
      },
      entities,
      assertCurrent,
    );
    // Strict waits refuse transitions whose proofs only cover the affected
    // state (top-ups, transfers, withdrawals, …); accept those as such. The
    // transition was submitted, so every wait failure leaves the outcome
    // unknown, whatever its error kind.
    let outcome: { proof: 'execution' | 'affected-state'; result: unknown };
    try {
      try {
        outcome = {
          proof: 'execution',
          result: await sdk.stateTransitions.waitForResponse(transition),
        };
      } catch (error) {
        if (!isSdkError(error, 'ExecutionNotProved')) throw error;
        outcome = {
          proof: 'affected-state',
          result: await sdk.stateTransitions.waitForAffectedState(transition),
        };
      }
    } catch (error) {
      throw new BroadcastOutcomeUnknownError(error, entities);
    }
    return {
      kind: 'raw' as const,
      message:
        (broadcast === 'accepted'
          ? `Broadcast the ${decoded.type} transition. `
          : `DAPI already held this ${decoded.type} transition, so it was not sent again. `) +
        (outcome.proof === 'execution'
          ? 'Platform proved that it executed.'
          : 'Platform proved the state it affects; for this kind of transition the proof does not show that this transition itself executed.'),
      stateTransitionHash: decoded.hash,
      type: decoded.type,
      ...entities,
      broadcast,
      proof: outcome.proof,
      result: plain(outcome.result),
    };
  });
}
