import { readFileSync, realpathSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  BroadcastOutcomeUnknownError,
  OperationNotSubmittedError,
  receiptEntities,
  submitOperation,
} from '../outcomes';

class StructuredSdkFailure {
  get name() {
    return 'WasmSdkError';
  }
  get kind() {
    return 'Transport';
  }
  get code() {
    return 14;
  }
  get message() {
    return 'Connection closed while awaiting confirmation';
  }
}

describe('transaction outcome messages', () => {
  it.each([OperationNotSubmittedError, BroadcastOutcomeUnknownError])(
    'preserves readable SDK getter messages and original cause in %s',
    (ErrorClass) => {
      const cause = new StructuredSdkFailure();
      const error = new ErrorClass(cause);
      expect(error.message).toBe(
        'WasmSdkError (Transport) [14]: Connection closed while awaiting confirmation',
      );
      expect(error.cause).toBe(cause);
    },
  );

  it('keeps a structured write rejection unknown without interpreting its code as rejection', async () => {
    const cause = new StructuredSdkFailure();
    const write = vi.fn().mockRejectedValue(cause);
    const error = await submitOperation(write, { identityId: 'identity-1' }).catch(
      (error: unknown) => error,
    );
    expect(write).toHaveBeenCalledOnce();
    expect(error).toBeInstanceOf(BroadcastOutcomeUnknownError);
    expect((error as Error).message).toContain(cause.message);
    expect((error as Error).cause).toBe(cause);
  });

  it('always links receipts to the signer identity, not an identity typed into a form', () => {
    expect(receiptEntities({ identityId: 'typed-identity', recipientId: 'r' }, 'signer')).toEqual({
      identityId: 'signer',
      recipientId: 'r',
    });
  });

  it.each([
    ['InvalidArgument', OperationNotSubmittedError],
    ['NotImplemented', OperationNotSubmittedError],
    ['DapiClientError', BroadcastOutcomeUnknownError],
    ['TimeoutReached', BroadcastOutcomeUnknownError],
    ['StateTransitionBroadcastError', BroadcastOutcomeUnknownError],
    ['Generic', BroadcastOutcomeUnknownError],
  ])('classifies SDK %s raised by a write call', async (name, expected) => {
    const cause = { name, kind: 0, message: 'boom' };
    const error = await submitOperation(() => Promise.reject(cause), {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(expected);
  });

  it('does not trust an ordinary Error that merely claims a local error name', async () => {
    const cause = Object.assign(new Error('Invalid'), { name: 'InvalidArgument' });
    const error = await submitOperation(() => Promise.reject(cause), {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BroadcastOutcomeUnknownError);
  });

  it('was audited against the pinned wasm-sdk', () => {
    // isPreSubmissionSdkError relies on InvalidArgument/NotImplemented being raised
    // only before any request in this exact SDK. Re-audit the wasm-sdk sources
    // (state_transitions/*.rs, dpns.rs, error.rs) before changing this version.
    // pnpm installs evo-sdk's wasm-sdk dependency next to it.
    const evo = realpathSync('node_modules/@dashevo/evo-sdk');
    const wasm = `${evo}/../wasm-sdk/package.json`;
    expect(JSON.parse(readFileSync(wasm, 'utf8')).version).toBe('4.0.0-rc.2');
  });
});
