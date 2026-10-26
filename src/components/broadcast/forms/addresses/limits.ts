// Client-side checks for Platform address operations. The limits are the
// protocol constants of platform v5.0.0-rc.8 (address funds exist from
// protocol 11; the values have not changed since): dpp_state_transition_versions
// address_funds.{min_input_amount, min_output_amount, min_identity_funding_amount},
// max_address_inputs/outputs, and the withdrawal rules in rs-dpp withdrawal/mod.rs.
// Amounts are credits (1 DASH = 100,000,000,000 credits), always exact bigints.

import { platformAddressError } from '@util/platform-address';
import { parseDecimalBigInt } from '../amount';
import { minWithdrawalCredits } from '../IdentityCreditWithdrawal';

export const MIN_OUTPUT_CREDITS = 500_000n;
/** An identity created or topped up from addresses must receive at least this much. */
export const MIN_IDENTITY_FUNDING_CREDITS = 200_000n;
export const MAX_ADDRESS_OUTPUTS = 128;
/** Platform's max_withdrawal_amount. */
export const MAX_WITHDRAWAL_CREDITS = 50_000_000_000_000n;
const U64_MAX = 2n ** 64n - 1n;
/** Bytes of the asset unlock transaction Core pays a withdrawal with. */
const ASSET_UNLOCK_TX_SIZE = 190n;
const CREDITS_PER_DUFF = 1000n;

export const formatCredits = (credits: bigint) => credits.toLocaleString('en-US');

export interface AddressOutput {
  /** bech32m Platform address. */
  address: string;
  amountCredits: bigint;
}

/** Parse a whole number of credits within `min`..`max` (inclusive). */
export function parseCredits(
  text: string,
  {
    min = 1n,
    max = U64_MAX,
    label = 'Amount',
  }: { min?: bigint; max?: bigint; label?: string } = {},
): { amount?: bigint; error?: string } {
  const amount = parseDecimalBigInt(text);
  if (amount === null) return { error: `${label}: enter a whole number of credits.` };
  if (amount < min) return { error: `${label} must be at least ${formatCredits(min)} credits.` };
  if (amount > max) return { error: `${label} must be at most ${formatCredits(max)} credits.` };
  return { amount };
}

/** Errors in a list of address outputs, or null when Platform would accept them. */
export function addressOutputsError(
  outputs: AddressOutput[],
  network: string,
  { from }: { from?: string } = {},
): string | null {
  if (!outputs.length) return 'Add at least one recipient address.';
  if (outputs.length > MAX_ADDRESS_OUTPUTS)
    return `Platform accepts at most ${MAX_ADDRESS_OUTPUTS} recipient addresses.`;
  const seen = new Set<string>();
  let total = 0n;
  for (const [index, output] of outputs.entries()) {
    const label = `Recipient ${index + 1}`;
    const addressError = platformAddressError(output.address, network);
    if (addressError) return `${label}: ${addressError}`;
    const normalised = output.address.trim().toLowerCase();
    if (seen.has(normalised)) return `${label} repeats an address; combine the amounts.`;
    if (from && normalised === from.toLowerCase())
      return `${label} is the sending address; an address cannot pay itself.`;
    seen.add(normalised);
    if (output.amountCredits < MIN_OUTPUT_CREDITS)
      return `${label} must receive at least ${formatCredits(MIN_OUTPUT_CREDITS)} credits.`;
    total += output.amountCredits;
  }
  return total > U64_MAX ? 'The amounts add up to more than Platform can represent.' : null;
}

export function sumOutputs(outputs: AddressOutput[]): bigint {
  return outputs.reduce((sum, output) => sum + output.amountCredits, 0n);
}

/**
 * The smallest address withdrawal Platform accepts. From protocol 14 the Core
 * fee of the asset unlock transaction is carved out of the withdrawn amount,
 * which must leave min_withdrawal_amount above it.
 */
export function minAddressWithdrawalCredits(
  protocolVersion: number | undefined,
  coreFeePerByte: number,
): bigint {
  const floor = minWithdrawalCredits(protocolVersion);
  // Without a known version, assume the stricter protocol 14 rule.
  if (protocolVersion !== undefined && protocolVersion < 14) return floor;
  return floor + ASSET_UNLOCK_TX_SIZE * BigInt(coreFeePerByte) * CREDITS_PER_DUFF;
}

/**
 * Platform's state_transition_min_fees (the same table in fee versions 1–3):
 * check_tx refuses an address transition whose fee source holds less than
 * this. The fee actually charged is usually higher.
 */
const MIN_FEES = {
  inputCost: 500_000n,
  outputCost: 6_000_000n,
  addressWithdrawal: 400_000_000n,
  identityCreateBase: 2_000_000n,
  keyInCreation: 6_500_000n,
  identityTopUpBase: 500_000n,
  transferToAddresses: 500_000n,
};

export const minFee = {
  transfer: (inputs: number, outputs: number) =>
    MIN_FEES.inputCost * BigInt(inputs) + MIN_FEES.outputCost * BigInt(outputs),
  withdrawal: () => MIN_FEES.addressWithdrawal + MIN_FEES.inputCost,
  topUpIdentity: () => MIN_FEES.identityTopUpBase + MIN_FEES.inputCost,
  createIdentity: (keys: number) =>
    MIN_FEES.identityCreateBase + MIN_FEES.inputCost + MIN_FEES.keyInCreation * BigInt(keys),
  transferFromIdentity: (outputs: number) =>
    MIN_FEES.transferToAddresses + MIN_FEES.outputCost * BigInt(outputs),
};

/**
 * Why `balance` cannot pay `amount` plus at least `fee` from what it keeps,
 * or null. Platform takes the fee from the balance left after the amount.
 */
export function shortfallError(
  balance: bigint | undefined,
  amount: bigint,
  fee: bigint,
): string | null {
  if (balance === undefined || balance >= amount + fee) return null;
  return (
    `The address holds ${formatCredits(balance)} credits; this needs ${formatCredits(amount)} ` +
    `plus a fee of at least ${formatCredits(fee)} credits.`
  );
}
