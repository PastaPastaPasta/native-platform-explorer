// Platform address operations (sdk.addresses.*). Address inputs are signed by
// a PlatformAddressSigner loaded from the form's WIF; the SDK fetches each
// input's nonce itself, so the nonce given to PlatformAddressInput is unused.
// transferFromIdentity is signed by the connected identity's transfer key.

import type {
  EvoSDK,
  FeeStrategyStep,
  PlatformAddressInfo,
  PlatformAddressInput,
  PlatformAddressOutput,
} from '@dashevo/evo-sdk';
import { createAddressSigner, freeAll, withPrivateKey } from '@/signer/form-keys';
import { newIdentityKeyCount } from '@/signer/new-identity';
import { coreScriptForAddress } from '@util/core-address';
import { platformAddressError } from '@util/platform-address';
import { resolveSigningCriteria } from '../capabilities';
import { fetchExistingIdentity, withSigningMaterial, type ExecuteArgs } from '../executors';
import type { AddressCreateIdentityOptions } from '../forms/addresses/AddressCreateIdentity';
import type { AddressFundFromAssetLockOptions } from '../forms/addresses/AddressFundFromAssetLock';
import type { AddressTopUpIdentityOptions } from '../forms/addresses/AddressTopUpIdentity';
import type { AddressTransferOptions } from '../forms/addresses/AddressTransfer';
import type { AddressTransferFromIdentityOptions } from '../forms/addresses/AddressTransferFromIdentity';
import type { AddressWithdrawOptions } from '../forms/addresses/AddressWithdraw';
import { validateCoreFeePerByte } from '../forms/IdentityCreditWithdrawal';
import {
  addressOutputsError,
  formatCredits,
  MAX_WITHDRAWAL_CREDITS,
  MIN_IDENTITY_FUNDING_CREDITS,
  minAddressWithdrawalCredits,
  minFee,
  shortfallError,
  sumOutputs,
  type AddressOutput,
} from '../forms/addresses/limits';
import { executeFormSigned } from './form-signed';
import { buildNewIdentity } from './identity-create';

type Network = 'mainnet' | 'testnet';

export interface AddressesResult {
  kind: 'addresses';
  message: string;
  /** Every Platform address the operation touched, for receipt links. */
  addresses: string[];
  /** Proved balance and nonce of each address afterwards. */
  balances?: Record<string, { balance: string; nonce: string }>;
  /** The identity credited, debited or created. */
  identityId?: string;
  newBalance?: string;
}

/** The SDK's address infos (keyed by hex) as bech32m → balance and nonce. */
function addressBalances(infos: Map<unknown, unknown>, network: Network) {
  const balances: Record<string, { balance: string; nonce: string }> = {};
  for (const value of infos.values()) {
    const info = value as PlatformAddressInfo;
    const address = info.address;
    try {
      balances[address.toBech32m(network)] = {
        balance: String(info.balance),
        nonce: String(info.nonce),
      };
    } finally {
      freeAll(address, info);
    }
  }
  return balances;
}

/** Load the input key and check it controls the reviewed address. */
async function inputSigner(wif: string, fromAddress: string, network: Network) {
  const material = await createAddressSigner([wif], network);
  if (material.addresses[0] !== fromAddress) {
    material.release();
    throw new Error('The address key no longer matches the reviewed sending address.');
  }
  return material;
}

/**
 * Refuse before signing when the paying address cannot cover `amount` plus
 * Platform's minimum fee: check_tx would reject the transition.
 */
async function assertSpendable(sdk: EvoSDK, address: string, amount: bigint, fee: bigint) {
  const info = await sdk.addresses.get(address);
  const balance = info?.balance ?? 0n;
  freeAll(info);
  const error = shortfallError(balance, amount, fee);
  if (error) throw new Error(error);
}

function assertOutputs(outputs: AddressOutput[], network: Network, from?: string) {
  const error = addressOutputsError(outputs, network, { from });
  if (error) throw new Error(error);
}

// The pinned SDK (5.0.0-rc.8) reads inputs, outputs and fee strategy steps
// with serde from plain objects. Its own PlatformAddressInput/Output and
// FeeStrategyStep instances fail there ("missing field `address`"), so plain
// objects in the shapes those classes serialize to are passed instead.
type SdkInputs = PlatformAddressInput[];
type SdkOutputs = PlatformAddressOutput[];
type SdkFeeStrategy = FeeStrategyStep[];

function addressOutputs(outputs: AddressOutput[]): SdkOutputs {
  return outputs.map((o) => ({
    address: o.address,
    amount: o.amountCredits,
  })) as unknown as SdkOutputs;
}

/** One input spending `amount`; the SDK fetches the address nonce itself. */
function singleInput(address: string, amount: bigint): SdkInputs {
  return [{ address, amount }] as unknown as SdkInputs;
}

function feeStrategy(step: 'deductFromInput' | 'reduceOutput'): SdkFeeStrategy {
  // A single input or output, so index 0 is unambiguous.
  return [{ $type: step, index: 0 }] as unknown as SdkFeeStrategy;
}

export async function executeAddressTransfer({
  sdk,
  options,
  assertCurrent,
}: ExecuteArgs<AddressTransferOptions>): Promise<AddressesResult> {
  return executeFormSigned(async (submit, onRelease) => {
    const { network, outputs, fromAddress } = options;
    assertOutputs(outputs, network, fromAddress);
    if (options.feeFrom === 'recipient' && outputs.length !== 1)
      throw new Error('The recipient can only pay the fee when there is one recipient.');
    const total = sumOutputs(outputs);
    const keys = await inputSigner(options.inputKeyWif, fromAddress, network);
    onRelease(keys.release);
    if (options.feeFrom === 'recipient' && outputs[0]!.amountCredits < minFee.transfer(1, 1))
      throw new Error(
        `To pay the fee, the recipient must receive at least ${formatCredits(minFee.transfer(1, 1))} credits.`,
      );
    await assertSpendable(
      sdk,
      fromAddress,
      total,
      options.feeFrom === 'recipient' ? 0n : minFee.transfer(1, outputs.length),
    );
    const addresses = [fromAddress, ...outputs.map((o) => o.address)];
    const infos = await submit(
      () =>
        sdk.addresses.transfer({
          inputs: singleInput(fromAddress, total),
          outputs: addressOutputs(outputs),
          signer: keys.signer,
          feeStrategy: feeStrategy(
            options.feeFrom === 'recipient' ? 'reduceOutput' : 'deductFromInput',
          ),
        }),
      { addresses },
      assertCurrent,
    );
    return {
      kind: 'addresses' as const,
      message: `Transferred ${formatCredits(total)} credits from ${fromAddress} to ${outputs.length} address(es).`,
      addresses,
      balances: addressBalances(infos, network),
    };
  });
}

export async function executeAddressTransferFromIdentity(
  args: ExecuteArgs<AddressTransferFromIdentityOptions>,
): Promise<AddressesResult> {
  const { sdk, options } = args;
  return withSigningMaterial(
    args,
    () => resolveSigningCriteria('addresses.transferFromIdentity', sdk, options),
    async (material, submit) => {
      assertOutputs(options.outputs, options.network);
      const identity = await fetchExistingIdentity(sdk, material.identityId);
      try {
        const addresses = options.outputs.map((o) => o.address);
        const result = await submit(
          () =>
            sdk.addresses.transferFromIdentity({
              identity,
              outputs: addressOutputs(options.outputs),
              signer: material.identitySigner,
              // Pin the reviewed key; the SDK would otherwise pick any transfer key.
              signingTransferKeyId: material.keyId,
            }),
          { identityId: material.identityId, addresses },
          args.assertCurrent,
        );
        try {
          return {
            kind: 'addresses' as const,
            message: `Transferred ${formatCredits(sumOutputs(options.outputs))} credits to ${addresses.length} address(es).`,
            addresses,
            balances: addressBalances(result.addressInfos, options.network),
            identityId: material.identityId,
            newBalance: String(result.newBalance),
          };
        } finally {
          freeAll(result);
        }
      } finally {
        freeAll(identity);
      }
    },
  );
}

export async function executeAddressTopUpIdentity({
  sdk,
  options,
  assertCurrent,
}: ExecuteArgs<AddressTopUpIdentityOptions>): Promise<AddressesResult> {
  return executeFormSigned(async (submit, onRelease) => {
    const { network, fromAddress, amountCredits, identityId } = options;
    if (amountCredits < MIN_IDENTITY_FUNDING_CREDITS)
      throw new Error(
        `Top-ups must be at least ${formatCredits(MIN_IDENTITY_FUNDING_CREDITS)} credits.`,
      );
    const keys = await inputSigner(options.inputKeyWif, fromAddress, network);
    onRelease(keys.release);
    await assertSpendable(sdk, fromAddress, amountCredits, minFee.topUpIdentity());
    const identity = await fetchExistingIdentity(sdk, identityId);
    onRelease(() => freeAll(identity));
    const result = await submit(
      () =>
        sdk.addresses.topUpIdentity({
          identity,
          inputs: singleInput(fromAddress, amountCredits),
          signer: keys.signer,
        }),
      { identityId, addresses: [fromAddress] },
      assertCurrent,
    );
    onRelease(() => freeAll(result));
    return {
      kind: 'addresses' as const,
      message: `Topped up ${identityId} with ${formatCredits(amountCredits)} credits from ${fromAddress}.`,
      addresses: [fromAddress],
      balances: addressBalances(result.addressInfos, network),
      identityId,
      newBalance: String(result.newBalance),
    };
  });
}

export async function executeAddressWithdraw({
  sdk,
  options,
  assertCurrent,
}: ExecuteArgs<AddressWithdrawOptions>): Promise<AddressesResult> {
  return executeFormSigned(async (submit, onRelease) => {
    const { network, fromAddress, amountCredits, toAddress } = options;
    const fee = validateCoreFeePerByte(String(options.coreFeePerByte));
    if (fee.error) throw new Error(fee.error);
    const min = minAddressWithdrawalCredits(options.protocolVersion, options.coreFeePerByte);
    if (amountCredits < min || amountCredits > MAX_WITHDRAWAL_CREDITS)
      throw new Error(
        `Withdrawals must be ${formatCredits(min)} to ${formatCredits(MAX_WITHDRAWAL_CREDITS)} credits.`,
      );
    const outputScript = await coreScriptForAddress(toAddress, network);
    onRelease(() => freeAll(outputScript));
    const keys = await inputSigner(options.inputKeyWif, fromAddress, network);
    onRelease(keys.release);
    await assertSpendable(sdk, fromAddress, amountCredits, minFee.withdrawal());
    const { PoolingWasm } = await import('@dashevo/evo-sdk');
    const infos = await submit(
      () =>
        sdk.addresses.withdraw({
          inputs: singleInput(fromAddress, amountCredits),
          coreFeePerByte: options.coreFeePerByte,
          // Platform currently rejects every pooling mode except "never".
          pooling: PoolingWasm.Never,
          outputScript,
          signer: keys.signer,
          feeStrategy: feeStrategy('deductFromInput'),
        }),
      { addresses: [fromAddress] },
      assertCurrent,
    );
    return {
      kind: 'addresses' as const,
      message:
        `Withdrew ${formatCredits(amountCredits)} credits from ${fromAddress} to ${toAddress}. ` +
        'Platform queues the withdrawal; it settles as a Core transaction later.',
      addresses: [fromAddress],
      balances: addressBalances(infos, network),
    };
  });
}

export async function executeAddressFundFromAssetLock({
  sdk,
  options,
  assertCurrent,
}: ExecuteArgs<AddressFundFromAssetLockOptions>): Promise<AddressesResult> {
  return executeFormSigned(async (submit, onRelease) => {
    const { network, address, proof } = options;
    const addressError = platformAddressError(address, network);
    if (addressError) throw new Error(addressError);
    const { AssetLockProof, PlatformAddressSigner } = await import('@dashevo/evo-sdk');
    const assetLockProof = AssetLockProof.fromHex(proof.proofHex);
    // There are no address inputs, so the address signer holds no keys.
    const signer = new PlatformAddressSigner();
    onRelease(() => freeAll(assetLockProof, signer));
    return withPrivateKey(
      options.assetLockKeyWif,
      network,
      'asset-lock private key',
      async (key) => {
        const infos = await submit(
          () =>
            sdk.addresses.fundFromAssetLock({
              assetLockProof,
              assetLockPrivateKey: key,
              // The one output receives the remainder (no amount) and pays the fee.
              outputs: [{ address }] as unknown as SdkOutputs,
              signer,
              feeStrategy: feeStrategy('reduceOutput'),
            }),
          { addresses: [address] },
          assertCurrent,
        );
        return {
          kind: 'addresses' as const,
          message: `Funded ${address} from asset lock ${proof.outPoint}.`,
          addresses: [address],
          balances: addressBalances(infos, network),
        };
      },
    );
  });
}

export async function executeAddressCreateIdentity({
  sdk,
  options,
  assertCurrent,
}: ExecuteArgs<AddressCreateIdentityOptions>): Promise<AddressesResult> {
  return executeFormSigned(async (submit, onRelease) => {
    const { network, fromAddress, amountCredits } = options;
    if (amountCredits < MIN_IDENTITY_FUNDING_CREDITS)
      throw new Error(
        `A new identity needs at least ${formatCredits(MIN_IDENTITY_FUNDING_CREDITS)} credits.`,
      );
    const keys = await inputSigner(options.inputKeyWif, fromAddress, network);
    onRelease(keys.release);
    await assertSpendable(
      sdk,
      fromAddress,
      amountCredits,
      minFee.createIdentity(newIdentityKeyCount(options.keys)),
    );
    // The SDK derives the identity ID from the inputs and their nonces.
    const created = await buildNewIdentity(
      sdk,
      options.keys,
      network,
      '11111111111111111111111111111111',
    );
    onRelease(created.release);
    const result = await submit(
      () =>
        sdk.addresses.createIdentity({
          identity: created.identity,
          inputs: singleInput(fromAddress, amountCredits),
          identitySigner: created.signer,
          addressSigner: keys.signer,
        }),
      { addresses: [fromAddress] },
      assertCurrent,
    );
    const identity = result.identity;
    const id = identity.id;
    try {
      const identityId = id.toBase58();
      return {
        kind: 'addresses' as const,
        message: `Created identity ${identityId} with ${formatCredits(amountCredits)} credits from ${fromAddress}.`,
        addresses: [fromAddress],
        balances: addressBalances(result.addressInfos, network),
        identityId,
        newBalance: String(identity.balance),
      };
    } finally {
      freeAll(id, identity, result);
    }
  });
}
