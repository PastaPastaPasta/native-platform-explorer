'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  HStack,
  Input,
  Radio,
  RadioGroup,
  Select,
  Stack,
  Text,
  VStack,
} from '@chakra-ui/react';
import { SecretInput } from '@ui/SecretInput';
import {
  DEFAULT_NEW_IDENTITY_KEYS,
  MAX_NEW_IDENTITY_KEYS,
  NEW_KEY_LEVELS,
  newKeySpecsError,
  prepareNewIdentityKeys,
  type NewIdentityKeyChoice,
  type NewIdentityKeySource,
  type NewKeyLevel,
  type NewKeyPurpose,
} from '@/signer/new-identity';
import { identityIndexError, identityKeyPath } from '@/signer/mnemonic';
import type { DerivationNetwork as Network } from '@/signer/types';
import { FormField, inputStyle, selectStyle, useKeyedAsync } from '../fields';

type KeyRow = { purpose: NewKeyPurpose; securityLevel: NewKeyLevel; privateKeyWif: string };

const DEFAULT_ROWS: KeyRow[] = DEFAULT_NEW_IDENTITY_KEYS.map((spec) => ({
  ...spec,
  privateKeyWif: '',
}));

/** Derive the public key hashes a source creates, checking it as signing will. */
async function deriveKeyHashes(key: string): Promise<string[]> {
  const [network, source] = JSON.parse(key) as [Network, NewIdentityKeySource];
  const keys = await prepareNewIdentityKeys(source, network);
  keys.release();
  return keys.publicKeyHashes;
}

/**
 * The new identity's keys: derived from a mnemonic on the DIP-13 identity
 * paths (so connecting that mnemonic on /wallet finds them), or explicit
 * private keys. Reports the source with the public key hashes it derives, so
 * the review can show them; null while it is incomplete or invalid.
 */
export function NewIdentityKeysFields({
  network,
  onChange,
}: {
  network: Network;
  onChange: (keys: NewIdentityKeyChoice | null) => void;
}) {
  const [kind, setKind] = useState<'mnemonic' | 'wif'>('mnemonic');
  const [mnemonic, setMnemonic] = useState('');
  const [identityIndex, setIdentityIndex] = useState('0');
  const [rows, setRows] = useState<KeyRow[]>(DEFAULT_ROWS);

  const index = /^\d+$/.test(identityIndex.trim()) ? Number(identityIndex.trim()) : NaN;
  const indexError = identityIndexError(index);
  const specError = kind === 'wif' ? newKeySpecsError(rows) : null;
  const source = useMemo<NewIdentityKeySource | null>(() => {
    if (kind === 'mnemonic')
      return mnemonic.trim() && !indexError
        ? { kind, mnemonic: mnemonic.trim().replace(/\s+/g, ' '), identityIndex: index }
        : null;
    return specError || rows.some((row) => !row.privateKeyWif.trim())
      ? null
      : { kind, keys: rows.map((row) => ({ ...row, privateKeyWif: row.privateKeyWif.trim() })) };
  }, [kind, mnemonic, indexError, index, specError, rows]);
  const derived = useKeyedAsync(source ? JSON.stringify([network, source]) : null, deriveKeyHashes);
  const hashes = derived?.value;
  const choice = useMemo(
    () => (source && hashes ? { source, publicKeyHashes: hashes } : null),
    [source, hashes],
  );

  useEffect(() => {
    onChange(choice);
  }, [choice, onChange]);

  const update = (i: number, patch: Partial<KeyRow>) =>
    setRows((current) =>
      current.map((row, j) => {
        if (j !== i) return row;
        const next = { ...row, ...patch };
        if (!NEW_KEY_LEVELS[next.purpose].includes(next.securityLevel))
          next.securityLevel = NEW_KEY_LEVELS[next.purpose][0]!;
        return next;
      }),
    );
  const hash = (id: number) => (hashes?.[id] ? ` · key hash ${hashes[id]}` : '');

  return (
    <VStack align="stretch" spacing={3}>
      <FormField label="New identity keys">
        <RadioGroup value={kind} onChange={(value) => setKind(value as 'mnemonic' | 'wif')}>
          <Stack direction={{ base: 'column', md: 'row' }} spacing={4}>
            <Radio value="mnemonic" size="sm">
              <Text fontSize="sm">Derive from a mnemonic (DIP-13)</Text>
            </Radio>
            <Radio value="wif" size="sm">
              <Text fontSize="sm">Enter private keys</Text>
            </Radio>
          </Stack>
        </RadioGroup>
      </FormField>
      {kind === 'mnemonic' ? (
        <>
          <FormField
            label="Wallet mnemonic"
            hint="The explorer derives the new keys and forgets the mnemonic after this operation. Write it down before you continue: it is the only backup of the identity's keys."
          >
            <SecretInput
              multiline
              rows={2}
              {...inputStyle}
              aria-label="Wallet mnemonic"
              value={mnemonic}
              onChange={(e) => setMnemonic(e.target.value)}
            />
          </FormField>
          <FormField
            label="Identity index"
            error={identityIndex && indexError ? indexError : null}
            hint="0 for the wallet's first identity. Use an index the wallet has not used yet."
          >
            <Input
              {...inputStyle}
              inputMode="numeric"
              aria-label="Identity index"
              value={identityIndex}
              onChange={(e) => setIdentityIndex(e.target.value)}
            />
          </FormField>
          <Box fontSize="xs" color="gray.400" data-testid="new-identity-keys">
            {DEFAULT_NEW_IDENTITY_KEYS.map((spec, id) => (
              <Text key={id} fontFamily="mono" wordBreak="break-all">
                #{id} {spec.purpose} {spec.securityLevel} ·{' '}
                {indexError ? '…' : identityKeyPath(network, index, id)}
                {hash(id)}
              </Text>
            ))}
          </Box>
        </>
      ) : (
        <VStack align="stretch" spacing={2}>
          {rows.map((row, i) => (
            <Box key={i} borderWidth="1px" borderColor="gray.700" borderRadius="md" p={2}>
              <HStack spacing={2} flexWrap="wrap">
                <Text fontSize="xs" color="gray.400" fontFamily="mono">
                  #{i}
                </Text>
                <Select
                  {...selectStyle}
                  w="auto"
                  aria-label={`New key ${i} purpose`}
                  value={row.purpose}
                  onChange={(e) => update(i, { purpose: e.target.value as NewKeyPurpose })}
                >
                  {Object.keys(NEW_KEY_LEVELS).map((purpose) => (
                    <option key={purpose} value={purpose}>
                      {purpose}
                    </option>
                  ))}
                </Select>
                <Select
                  {...selectStyle}
                  w="auto"
                  aria-label={`New key ${i} security level`}
                  value={row.securityLevel}
                  onChange={(e) => update(i, { securityLevel: e.target.value as NewKeyLevel })}
                >
                  {NEW_KEY_LEVELS[row.purpose].map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </Select>
                {rows.length > 1 ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setRows((current) => current.filter((_, j) => j !== i))}
                  >
                    Remove
                  </Button>
                ) : null}
              </HStack>
              <SecretInput
                mt={2}
                {...inputStyle}
                aria-label={`New key ${i} private key (WIF)`}
                placeholder="Private key (WIF)"
                value={row.privateKeyWif}
                onChange={(e) => update(i, { privateKeyWif: e.target.value })}
              />
              {hashes?.[i] ? (
                <Text fontSize="xs" color="gray.400" fontFamily="mono" mt={1}>
                  key hash {hashes[i]}
                </Text>
              ) : null}
            </Box>
          ))}
          <HStack justify="space-between">
            <Text fontSize="xs" color={specError ? 'danger' : 'gray.400'}>
              {specError ?? 'Key IDs follow the list order. Save these keys in your wallet first.'}
            </Text>
            <Button
              size="xs"
              variant="outline"
              isDisabled={rows.length >= MAX_NEW_IDENTITY_KEYS}
              onClick={() =>
                setRows((current) => [
                  ...current,
                  { purpose: 'AUTHENTICATION', securityLevel: 'HIGH', privateKeyWif: '' },
                ])
              }
            >
              Add a key
            </Button>
          </HStack>
        </VStack>
      )}
      {derived?.error ? (
        <Text fontSize="xs" color="danger" role="alert">
          {derived.error}
        </Text>
      ) : hashes ? (
        <Text fontSize="xs" color="gray.250">
          Compare these key hashes with your wallet before you continue: they are what the review
          shows and what gets signed.
        </Text>
      ) : null}
    </VStack>
  );
}
