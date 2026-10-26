// Broadcast of a transition signed elsewhere. The bytes are decoded locally
// and broadcast unchanged; DAPI reports a transition it already holds as
// "already in mempool/chain", which is not a failure: the result is awaited
// the same way.

import type { StateTransition } from '@dashevo/evo-sdk';
import { freeAll } from '@/signer/form-keys';
import type { ExecuteArgs } from '../executors';
import { decodeStateTransition } from '../forms/raw/decode';
import type { RawBroadcastOptions } from '../forms/raw/RawBroadcast';
import { BroadcastOutcomeUnknownError, sdkErrorName } from '../outcomes';
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

/**
 * Strict waits refuse transitions whose proofs only cover the affected state
 * (top-ups, transfers, withdrawals, …); accept those as such.
 */
async function waitForOutcome(
  sdk: ExecuteArgs<unknown>['sdk'],
  transition: StateTransition,
): Promise<{ proof: 'execution' | 'affected-state'; result: unknown }> {
  try {
    return { proof: 'execution', result: await sdk.stateTransitions.waitForResponse(transition) };
  } catch (error) {
    if (sdkErrorName(error) !== 'ExecutionNotProved') throw error;
    return {
      proof: 'affected-state',
      result: await sdk.stateTransitions.waitForAffectedState(transition),
    };
  }
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
  return executeFormSigned(null, async (submit, onRelease) => {
    const reviewed = options.transition;
    // Decode again from the reviewed hex: what is broadcast is built from it here.
    const decoded = await decodeStateTransition(reviewed.hex);
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
          if (sdkErrorName(error) === 'AlreadyExists') return 'already-known' as const;
          throw error;
        }
      },
      entities,
      assertCurrent,
    );
    // The transition was submitted, so every wait failure leaves the outcome
    // unknown, whatever its error kind.
    const outcome = await waitForOutcome(sdk, transition).catch((error: unknown) => {
      throw new BroadcastOutcomeUnknownError(error, entities);
    });
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
