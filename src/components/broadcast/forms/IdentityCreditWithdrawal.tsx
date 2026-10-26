'use client';

import { useEffect, useState } from 'react';
import { Box, Input, Radio, RadioGroup, Stack, Text, VStack } from '@chakra-ui/react';
import type { OperationFormProps } from '../OperationShell';
import { parseDecimalBigInt } from './amount';

export interface IdentityCreditWithdrawalOptions {
  network: 'mainnet' | 'testnet';
  /** Omitted for OWNER-key withdrawals, which pay the masternode payout address. */
  toAddress?: string;
  amountCredits: bigint;
  coreFeePerByte: number;
}

// Platform system limits (min_withdrawal_amount / max_withdrawal_amount).
const MIN_WITHDRAWAL_CREDITS = 190_000n;
const MAX_WITHDRAWAL_CREDITS = 50_000_000_000_000n;
/** Platform requires a Fibonacci core fee per byte; cap it far above normal relay fees. */
const CORE_FEE_PER_BYTE_OPTIONS = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89];

export function validateCoreFeePerByte(text: string): { fee?: number; error?: string } {
  const fee = /^\d+$/.test(text.trim()) ? Number(text.trim()) : NaN;
  if (!CORE_FEE_PER_BYTE_OPTIONS.includes(fee))
    return {
      error: `Core fee per byte must be a Fibonacci number from 1 to 89 (${CORE_FEE_PER_BYTE_OPTIONS.join(', ')}).`,
    };
  return { fee };
}

export function validateWithdrawalAmount(text: string): { amount?: bigint; error?: string } {
  const amount = parseDecimalBigInt(text);
  if (amount === null) return { error: 'Enter a whole number of credits.' };
  if (amount < MIN_WITHDRAWAL_CREDITS || amount > MAX_WITHDRAWAL_CREDITS)
    return {
      error: 'Withdrawals must be between 190,000 credits and 50,000,000,000,000 credits (500 DASH).',
    };
  return { amount };
}

export function IdentityCreditWithdrawalForm({
  network,
  onOptionsChange,
}: OperationFormProps<IdentityCreditWithdrawalOptions>) {
  const [destination, setDestination] = useState<'address' | 'payout'>('address');
  const [toAddress, setToAddress] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [feePerByte, setFeePerByte] = useState('1');
  const [addressCheck, setAddressCheck] = useState<{ address: string; valid: boolean } | null>(
    null,
  );

  const address = toAddress.trim();
  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    void import('@dashevo/evo-sdk')
      .then(({ wallet }) => wallet.validateAddress(address, network))
      .catch(() => false)
      .then((valid) => {
        if (!cancelled) setAddressCheck({ address, valid });
      });
    return () => {
      cancelled = true;
    };
  }, [address, network]);
  const addressValid = addressCheck?.address === address ? addressCheck.valid : undefined;

  const amount = validateWithdrawalAmount(amountStr);
  const fee = validateCoreFeePerByte(feePerByte);

  useEffect(() => {
    const ready = destination === 'payout' || addressValid === true;
    if (!ready || amount.amount === undefined || fee.fee === undefined) {
      onOptionsChange(null);
      return;
    }
    onOptionsChange({
      network,
      ...(destination === 'address' ? { toAddress: address } : {}),
      amountCredits: amount.amount,
      coreFeePerByte: fee.fee,
    });
  }, [destination, address, addressValid, amount.amount, fee.fee, network, onOptionsChange]);

  return (
    <VStack align="stretch" spacing={4}>
      <Box>
        <Text fontSize="sm" color="gray.100" fontWeight={500} mb={1}>
          Destination
        </Text>
        <RadioGroup
          value={destination}
          onChange={(value) => setDestination(value as 'address' | 'payout')}
        >
          <Stack spacing={1}>
            <Radio value="address" size="sm">
              <Text fontSize="sm">A Dash address (signed with a CRITICAL transfer key)</Text>
            </Radio>
            <Radio value="payout" size="sm">
              <Text fontSize="sm">
                The masternode payout address (signed with the owner key; masternode identities
                only)
              </Text>
            </Radio>
          </Stack>
        </RadioGroup>
      </Box>
      {destination === 'address' ? (
        <Box>
          <Text fontSize="sm" color="gray.100" fontWeight={500} mb={1}>
            Destination Dash Core address
          </Text>
          <Input
            size="sm"
            aria-label="Destination Dash Core address"
            value={toAddress}
            onChange={(e) => setToAddress(e.target.value)}
            fontFamily="mono"
            bg="gray.800"
            borderColor={addressValid === false ? 'danger' : 'gray.700'}
            placeholder={network === 'mainnet' ? 'X… or 7…' : 'y… or 8…'}
          />
          {address && addressValid === false ? (
            <Text fontSize="xs" color="danger" mt={1}>
              Not a valid {network} Dash address (check the network and for typos).
            </Text>
          ) : null}
        </Box>
      ) : (
        <Text fontSize="xs" color="gray.400">
          Platform pays owner-key withdrawals to the payout address registered for the masternode,
          so no address is sent.
        </Text>
      )}
      <Box>
        <Text fontSize="sm" color="gray.100" fontWeight={500} mb={1}>
          Amount (credits)
        </Text>
        <Input
          size="sm"
          aria-label="Amount (credits)"
          inputMode="numeric"
          value={amountStr}
          onChange={(e) => setAmountStr(e.target.value)}
          fontFamily="mono"
          bg="gray.800"
          borderColor="gray.700"
        />
        <Text fontSize="xs" color={amountStr && amount.error ? 'danger' : 'gray.400'} mt={1}>
          {amountStr && amount.error
            ? amount.error
            : '190,000 to 50,000,000,000,000 credits (1 DASH = 100,000,000,000 credits). Platform fees are deducted from the identity balance.'}
        </Text>
      </Box>
      <Box>
        <Text fontSize="sm" color="gray.100" fontWeight={500} mb={1}>
          Core fee per byte (duffs)
        </Text>
        <Input
          size="sm"
          aria-label="Core fee per byte"
          inputMode="numeric"
          value={feePerByte}
          onChange={(e) => setFeePerByte(e.target.value)}
          bg="gray.800"
          borderColor={fee.error ? 'danger' : 'gray.700'}
        />
        <Text fontSize="xs" color={fee.error ? 'danger' : 'gray.400'} mt={1}>
          {fee.error ??
            'Platform only accepts Fibonacci values; 1 is normal. Withdrawals are not pooled (Platform currently requires pooling "never").'}
        </Text>
      </Box>
    </VStack>
  );
}
