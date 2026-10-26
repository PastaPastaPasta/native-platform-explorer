'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, HStack, Input, Text, VStack } from '@chakra-ui/react';
import { SecretInput } from '@ui/SecretInput';
import { useAddressInfo } from '@sdk/queries';
import { platformAddressForWif } from '@/signer/form-keys';
import type { DerivationNetwork as Network } from '@/signer/types';
import { platformAddressHrp } from '@util/platform-address';
import { FormField, inputStyle, useKeyedAsync } from '../fields';
import {
  addressOutputsError,
  formatCredits,
  parseCredits,
  MIN_OUTPUT_CREDITS,
  type AddressOutput,
} from './limits';

/**
 * The Platform address a private key controls and its current balance. The
 * key is decoded only to derive the address; nothing is kept.
 */
export function useAddressKeyPreview(wif: string, network: Network) {
  const trimmed = wif.trim();
  const derived = useKeyedAsync(trimmed ? JSON.stringify([network, trimmed]) : null, (key) => {
    const [net, value] = JSON.parse(key) as [Network, string];
    return platformAddressForWif(value, net);
  });
  const info = useAddressInfo(derived?.value);
  const record = info.data as { balance?: bigint; nonce?: bigint } | null | undefined;
  return {
    address: derived?.value,
    error: derived?.error,
    checking: !!trimmed && !derived,
    balance: info.isSuccess ? (record?.balance ?? 0n) : undefined,
    nonce: info.isSuccess ? record?.nonce : undefined,
    balanceError: info.isError,
  };
}

/** The paying address's private key, with the address it controls and its balance. */
export function AddressKeyField({
  label,
  value,
  onChange,
  preview,
  network,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  preview: ReturnType<typeof useAddressKeyPreview>;
  network: Network;
}) {
  return (
    <FormField label={label}>
      <SecretInput
        {...inputStyle}
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <AddressKeyStatus preview={preview} network={network} />
    </FormField>
  );
}

/** A whole number of credits. */
export function CreditsField({
  label = 'Amount (credits)',
  value,
  onChange,
  error,
  hint,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  hint?: string;
}) {
  return (
    <FormField label={label} error={error} hint={hint}>
      <Input
        {...inputStyle}
        inputMode="numeric"
        aria-label="Amount (credits)"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </FormField>
  );
}

/** Status line under an address key field: the derived address and its balance. */
function AddressKeyStatus({
  preview,
  network,
}: {
  preview: ReturnType<typeof useAddressKeyPreview>;
  network: Network;
}) {
  if (preview.error)
    return (
      <Text fontSize="xs" color="danger" mt={1}>
        {preview.error}
      </Text>
    );
  if (!preview.address)
    return (
      <Text fontSize="xs" color="gray.400" mt={1}>
        {preview.checking
          ? 'Checking the key…'
          : `The WIF of the ${platformAddressHrp(network)}1… address that pays. It stays in this tab only for this operation.`}
      </Text>
    );
  return (
    <Text
      fontSize="xs"
      color="gray.250"
      mt={1}
      wordBreak="break-all"
      data-testid="address-key-status"
    >
      Address {preview.address} ·{' '}
      {preview.balance !== undefined
        ? `balance ${formatCredits(preview.balance)} credits${
            preview.nonce !== undefined ? ` · nonce ${preview.nonce}` : ''
          }`
        : preview.balanceError
          ? 'balance unavailable'
          : 'reading balance…'}
    </Text>
  );
}

interface OutputRow {
  address: string;
  amount: string;
}

/** Recipient Platform addresses and amounts. Reports parsed outputs, or null with an error. */
export function AddressOutputsEditor({
  network,
  from,
  maxRows = 16,
  onChange,
}: {
  network: Network;
  /** The sending address, which may not also receive. */
  from?: string;
  maxRows?: number;
  onChange: (outputs: AddressOutput[] | null) => void;
}) {
  const [rows, setRows] = useState<OutputRow[]>([{ address: '', amount: '' }]);
  const parsed = useMemo(() => {
    const outputs: AddressOutput[] = [];
    for (const [index, row] of rows.entries()) {
      const amount = parseCredits(row.amount, {
        min: MIN_OUTPUT_CREDITS,
        label: `Recipient ${index + 1} amount`,
      });
      if (amount.error) return { error: amount.error };
      outputs.push({ address: row.address.trim().toLowerCase(), amountCredits: amount.amount! });
    }
    const error = addressOutputsError(outputs, network, { from });
    return error ? { error } : { outputs };
  }, [rows, network, from]);

  useEffect(() => {
    onChange(parsed.outputs ?? null);
  }, [parsed, onChange]);

  const touched = rows.some((row) => row.address || row.amount);
  const update = (index: number, patch: Partial<OutputRow>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <VStack align="stretch" spacing={2}>
      {rows.map((row, index) => (
        <HStack key={index} spacing={2} align="flex-start">
          <Input
            {...inputStyle}
            flex={3}
            aria-label={`Recipient ${index + 1} address`}
            placeholder={`${platformAddressHrp(network)}1…`}
            value={row.address}
            onChange={(e) => update(index, { address: e.target.value })}
          />
          <Input
            {...inputStyle}
            flex={2}
            inputMode="numeric"
            aria-label={`Recipient ${index + 1} amount (credits)`}
            placeholder="Credits"
            value={row.amount}
            onChange={(e) => update(index, { amount: e.target.value })}
          />
          {rows.length > 1 ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
            >
              Remove
            </Button>
          ) : null}
        </HStack>
      ))}
      <HStack justify="space-between" align="flex-start">
        <Text fontSize="xs" color={touched && parsed.error ? 'danger' : 'gray.400'}>
          {touched && parsed.error
            ? parsed.error
            : `Each recipient receives at least ${formatCredits(MIN_OUTPUT_CREDITS)} credits (1 DASH = 100,000,000,000 credits).`}
        </Text>
        <Button
          size="xs"
          variant="outline"
          flexShrink={0}
          isDisabled={rows.length >= maxRows}
          onClick={() => setRows((current) => [...current, { address: '', amount: '' }])}
        >
          Add recipient
        </Button>
      </HStack>
    </VStack>
  );
}
