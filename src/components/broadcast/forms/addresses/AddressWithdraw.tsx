'use client';

import { useEffect, useState } from 'react';
import { Input, VStack } from '@chakra-ui/react';
import { SecretInput } from '@ui/SecretInput';
import { useCurrentEpoch } from '@sdk/queries';
import type { OperationFormProps } from '../../OperationShell';
import { validateCoreFeePerByte } from '../IdentityCreditWithdrawal';
import { AddressKeyStatus, FormField, inputStyle, useAddressKeyPreview } from './fields';
import {
  formatCredits,
  MAX_WITHDRAWAL_CREDITS,
  minAddressWithdrawalCredits,
  minFee,
  parseCredits,
  shortfallError,
} from './limits';

export interface AddressWithdrawOptions {
  network: 'mainnet' | 'testnet';
  inputKeyWif: string;
  fromAddress: string;
  amountCredits: bigint;
  /** Dash Core (L1) address that receives the withdrawal. */
  toAddress: string;
  coreFeePerByte: number;
  /** The network's active protocol version (from the current epoch), if known. */
  protocolVersion?: number;
}

export function AddressWithdrawForm({
  network,
  onOptionsChange,
}: OperationFormProps<AddressWithdrawOptions>) {
  const [wif, setWif] = useState('');
  const [toAddress, setToAddress] = useState('');
  const [amountText, setAmountText] = useState('');
  const [feeText, setFeeText] = useState('1');
  const [addressCheck, setAddressCheck] = useState<{ address: string; valid: boolean } | null>(
    null,
  );
  const preview = useAddressKeyPreview(wif, network);
  const epoch = useCurrentEpoch();
  const protocolVersion = epoch.data?.protocolVersion;
  const versionKnown = protocolVersion !== undefined || epoch.isError;
  const fee = validateCoreFeePerByte(feeText);
  const min = minAddressWithdrawalCredits(protocolVersion, fee.fee ?? 1);
  const amount = parseCredits(amountText, { min, max: MAX_WITHDRAWAL_CREDITS });
  const shortfall =
    amount.amount === undefined
      ? null
      : shortfallError(preview.balance, amount.amount, minFee.withdrawal());

  const destination = toAddress.trim();
  useEffect(() => {
    if (!destination) return;
    let cancelled = false;
    void import('@util/core-address')
      .then(({ coreScriptForAddress }) => coreScriptForAddress(destination, network))
      .then(
        (script) => {
          script.free();
          return true;
        },
        () => false,
      )
      .then((valid) => !cancelled && setAddressCheck({ address: destination, valid }));
    return () => {
      cancelled = true;
    };
  }, [destination, network]);
  const addressValid = addressCheck?.address === destination ? addressCheck.valid : undefined;

  useEffect(() => {
    if (
      !preview.address ||
      addressValid !== true ||
      !versionKnown ||
      amount.amount === undefined ||
      fee.fee === undefined ||
      shortfall
    ) {
      onOptionsChange(null);
      return;
    }
    onOptionsChange({
      network,
      inputKeyWif: wif.trim(),
      fromAddress: preview.address,
      amountCredits: amount.amount,
      toAddress: destination,
      coreFeePerByte: fee.fee,
      ...(protocolVersion !== undefined ? { protocolVersion } : {}),
    });
  }, [
    preview.address,
    addressValid,
    versionKnown,
    amount.amount,
    fee.fee,
    shortfall,
    wif,
    destination,
    protocolVersion,
    network,
    onOptionsChange,
  ]);

  return (
    <VStack align="stretch" spacing={4}>
      <FormField label="Paying address private key (WIF)">
        <SecretInput
          {...inputStyle}
          aria-label="Paying address private key (WIF)"
          value={wif}
          onChange={(e) => setWif(e.target.value)}
        />
        <AddressKeyStatus preview={preview} network={network} />
      </FormField>
      <FormField
        label="Destination Dash Core address"
        error={
          destination && addressValid === false ? `Not a valid ${network} Dash address.` : null
        }
      >
        <Input
          {...inputStyle}
          aria-label="Destination Dash Core address"
          placeholder={network === 'mainnet' ? 'X… or 7…' : 'y… or 8…'}
          value={toAddress}
          onChange={(e) => setToAddress(e.target.value)}
        />
      </FormField>
      <FormField
        label="Amount (credits)"
        error={(amountText && amount.error) || shortfall}
        hint={`${formatCredits(min)} to ${formatCredits(MAX_WITHDRAWAL_CREDITS)} credits${
          protocolVersion === undefined || protocolVersion >= 14
            ? '; from protocol 14 the Core fee comes out of this amount'
            : ''
        }. Platform's fee, at least ${formatCredits(minFee.withdrawal())} credits for a withdrawal, is paid on top from the address's remaining balance.${
          versionKnown ? '' : ' Checking the network protocol version…'
        }`}
      >
        <Input
          {...inputStyle}
          inputMode="numeric"
          aria-label="Amount (credits)"
          value={amountText}
          onChange={(e) => setAmountText(e.target.value)}
        />
      </FormField>
      <FormField
        label="Core fee per byte (duffs)"
        error={fee.error}
        hint='Platform only accepts Fibonacci values; 1 is normal. Withdrawals are not pooled (Platform requires pooling "never").'
      >
        <Input
          {...inputStyle}
          inputMode="numeric"
          aria-label="Core fee per byte"
          value={feeText}
          onChange={(e) => setFeeText(e.target.value)}
        />
      </FormField>
    </VStack>
  );
}
