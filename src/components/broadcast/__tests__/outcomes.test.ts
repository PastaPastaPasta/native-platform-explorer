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
    // only before the transition is submitted in this exact SDK. Re-audit the
    // wasm-sdk sources (state_transitions/*.rs, dpns.rs, error.rs) before
    // changing this version.
    //
    // 5.0.0-rc.8 audit (platform tag v5.0.0-rc.8): in all 50 write functions of
    // state_transitions/{addresses,broadcast,contract,document,identity,token}.rs
    // and dpns.rs, every explicit invalid_argument and every `?` on a
    // WasmDppError (whose InvalidArgument kind maps to this one) runs before the
    // submitting call. After it, errors are SdkError conversions (kind kept by
    // with_context; From<SdkError> yields InvalidArgument only for EncryptedFor,
    // which no write path raises), Generic (result object assembly), Protocol,
    // or the new ExecutionNotProved, which strict waits raise after an accepted
    // broadcast and which therefore stays "outcome unknown". The result
    // converters (wasm-dpp2 convert_proof_result) are infallible.
    // NotImplemented is no longer raised anywhere in 5.0.0-rc.8.
    //
    // Re-checked for the form-signed writes (same tag): addressFundsTransfer,
    // identityTopUpFromAddresses, addressFundsWithdraw, identityTransferToAddresses,
    // addressFundingFromAssetLock, identityCreateFromAddresses (its nonce lookup
    // raises InvalidArgument for unknown or underfunded inputs, before building
    // the transition), identityCreate, identityTopUp, masternodeVote (a duplicate
    // vote is resolved inside the call by fetching the recorded vote) and
    // broadcastStateTransition. The raw broadcast waits (waitForResponse,
    // waitForAffectedState) run after the executor's own broadcast, so the
    // executor reports every wait failure as "outcome unknown" whatever its kind.
    //
    // Token writes (state_transitions/token.rs, re-audited for the token
    // operations): tokenMint, tokenBurn, tokenTransfer, tokenFreeze,
    // tokenUnfreeze, tokenDestroyFrozen, tokenEmergencyAction, tokenSetPrice,
    // tokenDirectPurchase, tokenClaim and tokenConfigUpdate each parse their
    // options (try_from_options / deserialize_*_options / groupInfo), raise
    // their explicit invalid_argument checks (self-transfer, unknown emergency
    // action or distribution type, setPrice's price/priceTiers exclusivity and
    // build_price_tiers) and await get_or_fetch_contract before the one
    // submitting call, inner_sdk().token_*(builder, key, signer). Its error is
    // wrapped by with_context (kind kept), and the *ResultWasm::from_result
    // converters after it are infallible. A failed contract fetch is a network
    // kind, so it stays "outcome unknown" although nothing was submitted.
    // pnpm installs evo-sdk's wasm-sdk dependency next to it.
    const evo = realpathSync('node_modules/@dashevo/evo-sdk');
    const wasm = `${evo}/../wasm-sdk/package.json`;
    expect(JSON.parse(readFileSync(wasm, 'utf8')).version).toBe('5.0.0-rc.8');
  });
});
