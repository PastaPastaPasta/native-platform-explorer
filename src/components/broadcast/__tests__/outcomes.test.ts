import { describe, expect, it, vi } from 'vitest';
import {
  BroadcastOutcomeUnknownError,
  OperationNotSubmittedError,
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
});
