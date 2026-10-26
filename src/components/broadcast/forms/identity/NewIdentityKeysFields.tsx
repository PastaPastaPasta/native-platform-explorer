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
  type NewIdentityKeySource,
  type NewKeyLevel,
  type NewKeyPurpose,
} from '@/signer/new-identity';
import { identityKeyPath } from '@/signer/mnemonic';
import { FormField, inputStyle } from '../addresses/fields';

type Network = 'mainnet' | 'testnet';
type KeyRow = { purpose: NewKeyPurpose; securityLevel: NewKeyLevel; privateKeyWif: string };

const DEFAULT_ROWS: KeyRow[] = DEFAULT_NEW_IDENTITY_KEYS.map((spec) => ({
  ...spec,
  privateKeyWif: '',
}));

/** Review-safe view of a key source: the key layout without the mnemonic or WIFs. */
export function redactNewIdentityKeys(source: NewIdentityKeySource) {
  return source.kind === 'mnemonic'
    ? { from: 'mnemonic (hidden)', identityIndex: source.identityIndex }
    : {
        from: 'private keys (hidden)',
        keys: source.keys.map(({ purpose, securityLevel }, id) => ({ id, purpose, securityLevel })),
      };
}

/** Checks a mnemonic, or WIFs, for the network without keeping anything. */
function useSecretCheck(source: NewIdentityKeySource | null, network: Network) {
  const [check, setCheck] = useState<{ source: NewIdentityKeySource; errors: string[] } | null>(
    null,
  );
  useEffect(() => {
    if (!source) return;
    let cancelled = false;
    void (async () => {
      const { wallet } = await import('@dashevo/evo-sdk');
      let errors: string[];
      if (source.kind === 'mnemonic') {
        const valid = await wallet.validateMnemonic(source.mnemonic).catch(() => false);
        errors = [valid ? '' : 'That BIP-39 mnemonic is not valid.'];
      } else {
        errors = await Promise.all(
          source.keys.map(async ({ privateKeyWif }, index) => {
            if (!privateKeyWif) return 'Enter the private key (WIF) for this key.';
            const duplicate = source.keys.findIndex((k) => k.privateKeyWif === privateKeyWif);
            if (duplicate !== index) return 'The same private key is listed twice.';
            try {
              const pair = await wallet.keyPairFromWif(privateKeyWif);
              try {
                return pair.network === network
                  ? ''
                  : `This private key is for ${pair.network}, not ${network}.`;
              } finally {
                pair.free();
              }
            } catch {
              return 'Not a valid WIF private key.';
            }
          }),
        );
      }
      if (!cancelled) setCheck({ source, errors });
    })();
    return () => {
      cancelled = true;
    };
  }, [source, network]);
  return check?.source === source ? check.errors : null;
}

/**
 * The new identity's keys: derived from a mnemonic on the DIP-13 identity
 * paths (so connecting that mnemonic on /wallet finds them), or explicit
 * private keys. Reports the source, or null while it is incomplete or invalid.
 */
export function NewIdentityKeysFields({
  network,
  onChange,
}: {
  network: Network;
  onChange: (source: NewIdentityKeySource | null) => void;
}) {
  const [kind, setKind] = useState<'mnemonic' | 'wif'>('mnemonic');
  const [mnemonic, setMnemonic] = useState('');
  const [identityIndex, setIdentityIndex] = useState('0');
  const [rows, setRows] = useState<KeyRow[]>(DEFAULT_ROWS);

  const index = /^\d+$/.test(identityIndex.trim()) ? Number(identityIndex.trim()) : NaN;
  const indexError =
    Number.isSafeInteger(index) && index < 2 ** 31
      ? null
      : 'Enter an identity index from 0 to 2147483647.';
  const specError = kind === 'wif' ? newKeySpecsError(rows) : null;
  const source = useMemo<NewIdentityKeySource | null>(() => {
    if (kind === 'mnemonic')
      return mnemonic.trim() && !indexError
        ? { kind, mnemonic: mnemonic.trim().replace(/\s+/g, ' '), identityIndex: index }
        : null;
    return specError
      ? null
      : { kind, keys: rows.map((row) => ({ ...row, privateKeyWif: row.privateKeyWif.trim() })) };
  }, [kind, mnemonic, indexError, index, specError, rows]);
  const errors = useSecretCheck(source, network);
  const ready = source && errors && !errors.some(Boolean) ? source : null;

  useEffect(() => {
    onChange(ready);
  }, [ready, onChange]);

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
            error={errors?.[0] || null}
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
          <Box fontSize="xs" color="gray.400">
            {DEFAULT_NEW_IDENTITY_KEYS.map((spec, id) => (
              <Text key={id} fontFamily="mono">
                #{id} {spec.purpose} {spec.securityLevel} ·{' '}
                {indexError ? '…' : identityKeyPath(network, index, id)}
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
                  size="sm"
                  w="auto"
                  bg="gray.800"
                  borderColor="gray.700"
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
                  size="sm"
                  w="auto"
                  bg="gray.800"
                  borderColor="gray.700"
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
              {errors?.[i] && row.privateKeyWif ? (
                <Text fontSize="xs" color="danger" mt={1}>
                  {errors[i]}
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
    </VStack>
  );
}
