'use client';

import { useEffect, useState } from 'react';
import { Input, VStack } from '@chakra-ui/react';
import { useCurrentEpoch } from '@sdk/queries';
import type { DerivationNetwork } from '@/signer/types';
import { isCoreAddress } from '@util/core-address';
import type { OperationFormProps } from '../../OperationShell';
import { FormField, inputStyle, useKeyedAsync } from '../fields';
import { validateCoreFeePerByte } from '../IdentityCreditWithdrawal';
import { AddressKeyField, CreditsField, useAddressKeyPreview } from './fields';
import {
  formatCredits,
  MAX_WITHDRAWAL_CREDITS,
  minAddressWithdrawalCredits,
  minFee,
  parseCredits,
  shortfallError,
} from './limits';

export interface AddressWithdrawOptions {
  network: DerivationNetwork;
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
  const addressValid = useKeyedAsync(
    destination ? JSON.stringify([network, destination]) : null,
    (key) => {
      const [net, address] = JSON.parse(key) as [DerivationNetwork, string];
      return isCoreAddress(address, net);
    },
  )?.value;

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
      <AddressKeyField
        label="Paying address private key (WIF)"
        value={wif}
        onChange={setWif}
        preview={preview}
        network={network}
      />
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
      <CreditsField
        value={amountText}
        onChange={setAmountText}
        error={(amountText && amount.error) || shortfall}
        hint={`${formatCredits(min)} to ${formatCredits(MAX_WITHDRAWAL_CREDITS)} credits${
          protocolVersion === undefined || protocolVersion >= 14
            ? '; from protocol 14 the Core fee comes out of this amount'
            : ''
        }. Platform's fee, at least ${formatCredits(minFee.withdrawal())} credits for a withdrawal, is paid on top from the address's remaining balance.${
          versionKnown ? '' : ' Checking the network protocol version…'
        }`}
      />
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
