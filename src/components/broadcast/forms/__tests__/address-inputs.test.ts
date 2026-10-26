import { beforeAll, describe, expect, it } from 'vitest';
import { CoreScript, wallet } from '@dashevo/evo-sdk';
import { coreScriptForAddress, decodeCoreAddress } from '@util/core-address';
import {
  addressOutputsError,
  minAddressWithdrawalCredits,
  minFee,
  parseCredits,
  shortfallError,
  sumOutputs,
} from '../addresses/limits';
import { parseAssetLockProof } from '../identity/asset-lock';
import { decodeStateTransition, stateTransitionBytes } from '../raw/decode';

const A = 'tdash1kp63uahgrxged4z5jswyt5dn5v3lzsem6cwarqfg';
const B = 'tdash1krjjyfzq5ecwfckja4al0f4d702th5r5pgrawfla';
const MAINNET = 'dash1kp63uahgrxged4z5jswyt5dn5v3lzsem6c76s7cx';
const TXID = 'a7383eb8e75f425b1da0b67ee735d612a652de1bad5c76d54f972f30b8ff3422';
/** IdentityCreditTransfer of 1,000,000 credits signed offline with key #3 = 0x…01. */
const SIGNED_HEX =
  '07007199f1f68404c86ecf60d9cb93ac2bdd02c0109cdbfeb759142b8ab9135f4b198bf296f9b006c8743b45ecb55d0e253f39d1c23e8865724f865dc3f7d5804b09fc000f424007000341202733b5fde2725f9d7b49618bc475aafb2d844d695793bfecbfbd44dcd672ef66542a44d2e3855f9ae3fa332cbaf9ea7d4227862db14db9df1028117e22a70786';
const SIGNED_HASH = 'ea089b7d50ec73f1a44d53d62f85e63225edd2ea061521c27f8fa7902ea8e432';

beforeAll(async () => {
  await wallet.validateMnemonic('abandon');
});

describe('address amounts', () => {
  it('parses exact whole credits only', () => {
    expect(parseCredits('9007199254740993')).toEqual({ amount: 9007199254740993n });
    expect(parseCredits('0x10').error).toMatch(/whole number/);
    expect(parseCredits('1.5').error).toMatch(/whole number/);
    expect(parseCredits('99', { min: 100n }).error).toMatch(/at least 100 credits/);
    expect(parseCredits('18446744073709551616').error).toMatch(/at most/);
  });

  it('checks recipients against the network, the minimum and the sender', () => {
    const ok = [{ address: A, amountCredits: 500_000n }];
    expect(addressOutputsError(ok, 'testnet')).toBeNull();
    expect(addressOutputsError([], 'testnet')).toMatch(/at least one/);
    expect(addressOutputsError([{ address: MAINNET, amountCredits: 500_000n }], 'testnet')).toMatch(
      /mainnet/,
    );
    expect(addressOutputsError([{ address: A, amountCredits: 499_999n }], 'testnet')).toMatch(
      /at least 500,000/,
    );
    expect(addressOutputsError([...ok, ...ok], 'testnet')).toMatch(/repeats an address/);
    expect(addressOutputsError(ok, 'testnet', { from: A })).toMatch(/sending address/);
    expect(sumOutputs([...ok, { address: B, amountCredits: 2n ** 63n }])).toBe(
      2n ** 63n + 500_000n,
    );
  });

  it('applies the protocol 14 withdrawal minimum and the minimum fees', () => {
    expect(minAddressWithdrawalCredits(13, 1)).toBe(1_000_000n);
    expect(minAddressWithdrawalCredits(14, 1)).toBe(1_190_000n);
    expect(minAddressWithdrawalCredits(undefined, 2)).toBe(1_380_000n);
    expect(minFee.withdrawal()).toBe(400_500_000n);
    expect(minFee.transfer(1, 2)).toBe(12_500_000n);
    expect(minFee.createIdentity(4)).toBe(28_500_000n);
    expect(minFee.topUpIdentity()).toBe(1_000_000n);
    expect(shortfallError(undefined, 5n, 5n)).toBeNull();
    expect(shortfallError(10n, 5n, 5n)).toBeNull();
    expect(shortfallError(9n, 5n, 5n)).toMatch(/holds 9 credits/);
  });
});

describe('Core addresses', () => {
  it('builds the output script for P2PKH and P2SH addresses of the network only', async () => {
    const p2pkh = await coreScriptForAddress('yWziQMcwmKjRdzi7eWjwiQX8EjWcd6dSg6', 'testnet');
    expect(p2pkh.toHex()).toBe('76a914751e76e8199196d454941c45d1b3a323f1433bd688ac');
    expect(decodeCoreAddress('XmN7PQYWKn5MJFna5fRYgP6mxT2F7xpekE', 'mainnet')?.type).toBe('p2pkh');
    expect(decodeCoreAddress('XmN7PQYWKn5MJFna5fRYgP6mxT2F7xpekE', 'testnet')).toBeNull();
    const p2shAddress = CoreScript.fromP2SH(new Uint8Array(20).fill(7)).toAddress('testnet');
    expect(decodeCoreAddress(p2shAddress, 'testnet')?.type).toBe('p2sh');
    expect((await coreScriptForAddress(p2shAddress, 'testnet')).toHex()).toBe(
      `a914${'07'.repeat(20)}87`,
    );
    await expect(
      coreScriptForAddress('XmN7PQYWKn5MJFna5fRYgP6mxT2F7xpekE', 'testnet'),
    ).rejects.toThrow(/not a valid testnet Dash address/);
    // A one-character typo fails the checksum.
    await expect(
      coreScriptForAddress('yWziQMcwmKjRdzi7eWjwiQX8EjWcd6dSg7', 'testnet'),
    ).rejects.toThrow();
  });
});

describe('asset-lock proofs', () => {
  it('normalises chain-lock fields, hex and JSON to the same proof and identity', async () => {
    const chain = await parseAssetLockProof({
      kind: 'chain',
      txid: TXID.toUpperCase(),
      outputIndex: '0',
      coreChainLockedHeight: '1579591',
    });
    expect(chain).toEqual({
      proofHex: expect.stringMatching(/^[0-9a-f]+$/),
      type: 'chain',
      outPoint: `${TXID}:0`,
      identityId: 'ARJDcyfBJFVvWhVZaX4DhwswABWXjHKDWRnzyNT4CpTa',
    });
    await expect(
      parseAssetLockProof({ kind: 'serialized', text: chain.proofHex }),
    ).resolves.toEqual(chain);
    await expect(
      parseAssetLockProof({
        kind: 'serialized',
        text: JSON.stringify({
          $type: 'chain',
          coreChainLockedHeight: 1579591,
          outPoint: `${TXID}:0`,
        }),
      }),
    ).resolves.toEqual(chain);
  });

  it.each([
    [
      { kind: 'chain' as const, txid: 'abc', outputIndex: '0', coreChainLockedHeight: '1' },
      /64 hex/,
    ],
    [
      { kind: 'chain' as const, txid: TXID, outputIndex: '-1', coreChainLockedHeight: '1' },
      /whole number/,
    ],
    [
      { kind: 'instant' as const, instantLockHex: 'zz', transactionHex: '00', outputIndex: '0' },
      /must be hex/,
    ],
    [
      { kind: 'instant' as const, instantLockHex: '0101', transactionHex: '00', outputIndex: '0' },
      /not a valid asset-lock proof/,
    ],
    [{ kind: 'serialized' as const, text: '{not json' }, /not a valid asset-lock proof/],
  ])('reports bad proof input %#', async (input, error) => {
    await expect(parseAssetLockProof(input)).rejects.toThrow(error);
  });
});

describe('raw state transitions', () => {
  it('decodes hex and base64 to the same reviewed transition and hash', async () => {
    const decoded = await decodeStateTransition(
      ` ${SIGNED_HEX.slice(0, 40)}\n${SIGNED_HEX.slice(40)} `,
    );
    expect(decoded).toEqual({
      hex: SIGNED_HEX,
      type: 'IdentityCreditTransfer',
      hash: SIGNED_HASH,
      ownerId: '8eTDkBhpQjHeqgbVeriRqeycjb9vCKvCa4WhdcRmkpKr',
      signaturePublicKeyId: 3,
      identityNonce: '7',
      userFeeIncrease: 0,
    });
    const base64 = btoa(String.fromCharCode(...stateTransitionBytes(SIGNED_HEX)));
    await expect(decodeStateTransition(base64)).resolves.toEqual(decoded);
  });

  it('refuses input that is not exactly one canonical transition', async () => {
    await expect(decodeStateTransition('')).rejects.toThrow(/Paste/);
    await expect(decodeStateTransition('not hex!')).rejects.toThrow(/hex or base64/);
    await expect(decodeStateTransition('00ff')).rejects.toThrow(/could not decode/);
    // Trailing bytes would not be broadcast; the decoded hash would not match.
    await expect(decodeStateTransition(`${SIGNED_HEX}00`)).rejects.toThrow();
  });
});
