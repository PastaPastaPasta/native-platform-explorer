'use client';

import { useEffect, useMemo, useState } from 'react';
import { Box, Button, HStack, Input, Select, Text, Textarea, VStack } from '@chakra-ui/react';
import type { OperationFormProps } from '../OperationShell';

/** Purposes and security levels Platform accepts for keys added by an identity update. */
const ADDABLE_KEY_LEVELS = {
  AUTHENTICATION: ['MASTER', 'CRITICAL', 'HIGH', 'MEDIUM'],
  TRANSFER: ['CRITICAL'],
  ENCRYPTION: ['MEDIUM'],
  DECRYPTION: ['MEDIUM'],
} as const;
/** Platform's max_public_keys_in_creation. */
const MAX_ADDED_KEYS = 6;

export type AddablePurpose = keyof typeof ADDABLE_KEY_LEVELS;
export type AddableKeyType = 'ECDSA_SECP256K1' | 'ECDSA_HASH160';

export interface NewIdentityKey {
  purpose: AddablePurpose;
  securityLevel: (typeof ADDABLE_KEY_LEVELS)[AddablePurpose][number];
  keyType: AddableKeyType;
  /** The new key's private key. The SDK signs the key's proof of possession with it. */
  privateKeyWif: string;
}

export interface IdentityUpdateKeysOptions {
  network: 'mainnet' | 'testnet';
  addKeys?: NewIdentityKey[];
  disableKeyIds?: number[];
}

/** Review-safe view: never show the new keys' private keys. */
export function redactIdentityUpdateKeys(options: IdentityUpdateKeysOptions) {
  return {
    ...options,
    addKeys: options.addKeys?.map(({ privateKeyWif: _secret, ...key }) => ({
      ...key,
      privateKey: 'provided (hidden)',
    })),
  };
}

/** The options with the new keys' private keys removed, kept after execution. */
export function stripIdentityUpdateKeySecrets(
  options: IdentityUpdateKeysOptions,
): IdentityUpdateKeysOptions {
  return {
    ...options,
    addKeys: options.addKeys?.map((key) => ({ ...key, privateKeyWif: '' })),
  };
}

function parseDisableIds(text: string): { ids?: number[]; error?: string } {
  const trimmed = text.trim();
  if (!trimmed) return {};
  const entries = trimmed.split(/[,\s]+/);
  const ids = entries.map(Number);
  if (
    entries.some(
      (entry, index) =>
        !/^\d+$/.test(entry) || !Number.isSafeInteger(ids[index]) || ids[index]! > 0xffffffff,
    )
  ) {
    return { error: 'Disable-key IDs must be comma/space-separated unsigned 32-bit integers.' };
  }
  return { ids };
}

const blankKey = (): NewIdentityKey => ({
  purpose: 'AUTHENTICATION',
  securityLevel: 'HIGH',
  keyType: 'ECDSA_SECP256K1',
  privateKeyWif: '',
});

export function IdentityUpdateKeysForm({
  network,
  onOptionsChange,
}: OperationFormProps<IdentityUpdateKeysOptions>) {
  const [keys, setKeys] = useState<NewIdentityKey[]>([]);
  const [disableText, setDisableText] = useState('');
  // Async WIF checks; keyed by the exact key list so stale results are ignored.
  const [wifCheck, setWifCheck] = useState<{ keys: NewIdentityKey[]; errors: string[] } | null>(
    null,
  );

  const disable = useMemo(() => parseDisableIds(disableText), [disableText]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { wallet } = await import('@dashevo/evo-sdk');
      const errors = await Promise.all(
        keys.map(async (key, index) => {
          const wif = key.privateKeyWif.trim();
          if (!wif) return 'Enter the private key (WIF) for this key.';
          try {
            const pair = await wallet.keyPairFromWif(wif);
            try {
              if (pair.network !== network)
                return `This private key is for ${pair.network}, not ${network}.`;
            } finally {
              pair.free();
            }
          } catch {
            return 'Not a valid WIF private key.';
          }
          const duplicate = keys.findIndex((other) => other.privateKeyWif.trim() === wif);
          return duplicate !== index ? 'The same private key is listed twice.' : '';
        }),
      );
      if (!cancelled) setWifCheck({ keys, errors });
    })();
    return () => {
      cancelled = true;
    };
  }, [keys, network]);
  const keyErrors = wifCheck?.keys === keys ? wifCheck.errors : null;

  useEffect(() => {
    if (
      disable.error ||
      keys.length > MAX_ADDED_KEYS ||
      !keyErrors ||
      keyErrors.some(Boolean) ||
      (!keys.length && !disable.ids?.length)
    ) {
      onOptionsChange(null);
      return;
    }
    onOptionsChange({
      network,
      addKeys: keys.length ? keys.map((key) => ({ ...key, privateKeyWif: key.privateKeyWif.trim() })) : undefined,
      disableKeyIds: disable.ids,
    });
  }, [keys, keyErrors, disable, network, onOptionsChange]);

  const update = (index: number, patch: Partial<NewIdentityKey>) =>
    setKeys((current) =>
      current.map((key, i) => {
        if (i !== index) return key;
        const next = { ...key, ...patch };
        const levels: readonly string[] = ADDABLE_KEY_LEVELS[next.purpose];
        if (!levels.includes(next.securityLevel))
          next.securityLevel = levels[0] as NewIdentityKey['securityLevel'];
        return next;
      }),
    );

  return (
    <VStack align="stretch" spacing={4}>
      <Box>
        <Text fontSize="sm" color="gray.100" fontWeight={500} mb={1}>
          Keys to add
        </Text>
        <Text fontSize="xs" color="gray.400" mb={2}>
          Platform requires every new ECDSA_SECP256K1 key to sign the update with its own private
          key, so enter each new key&apos;s WIF. ECDSA_HASH160 keys are not signed, but the explorer
          still asks for their WIF so the key data comes from a key you actually hold. The public
          key (or its hash) is derived from the WIF, the key ID is assigned automatically, and the
          private key stays in this tab&apos;s memory only for this operation. Save the new keys in
          your wallet first.
        </Text>
        <VStack align="stretch" spacing={3}>
          {keys.map((key, index) => (
            <Box key={index} borderWidth="1px" borderColor="gray.700" borderRadius="md" p={3}>
              <HStack spacing={2} flexWrap="wrap">
                <Select
                  size="sm"
                  w="auto"
                  aria-label={`New key ${index + 1} purpose`}
                  value={key.purpose}
                  onChange={(e) => update(index, { purpose: e.target.value as AddablePurpose })}
                  bg="gray.800"
                  borderColor="gray.700"
                >
                  {Object.keys(ADDABLE_KEY_LEVELS).map((purpose) => (
                    <option key={purpose} value={purpose}>
                      {purpose}
                    </option>
                  ))}
                </Select>
                <Select
                  size="sm"
                  w="auto"
                  aria-label={`New key ${index + 1} security level`}
                  value={key.securityLevel}
                  onChange={(e) =>
                    update(index, {
                      securityLevel: e.target.value as NewIdentityKey['securityLevel'],
                    })
                  }
                  bg="gray.800"
                  borderColor="gray.700"
                >
                  {ADDABLE_KEY_LEVELS[key.purpose].map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </Select>
                <Select
                  size="sm"
                  w="auto"
                  aria-label={`New key ${index + 1} type`}
                  value={key.keyType}
                  onChange={(e) => update(index, { keyType: e.target.value as AddableKeyType })}
                  bg="gray.800"
                  borderColor="gray.700"
                >
                  <option value="ECDSA_SECP256K1">ECDSA_SECP256K1</option>
                  <option value="ECDSA_HASH160">ECDSA_HASH160</option>
                </Select>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setKeys((current) => current.filter((_, i) => i !== index))}
                >
                  Remove
                </Button>
              </HStack>
              <Input
                mt={2}
                size="sm"
                type="password"
                autoComplete="off"
                spellCheck={false}
                aria-label={`New key ${index + 1} private key (WIF)`}
                placeholder="Private key (WIF)"
                value={key.privateKeyWif}
                onChange={(e) => update(index, { privateKeyWif: e.target.value })}
                fontFamily="mono"
                bg="gray.800"
                borderColor="gray.700"
              />
              {keyErrors?.[index] && key.privateKeyWif ? (
                <Text fontSize="xs" color="danger" mt={1}>
                  {keyErrors[index]}
                </Text>
              ) : null}
            </Box>
          ))}
          <Button
            size="sm"
            variant="outline"
            alignSelf="flex-start"
            isDisabled={keys.length >= MAX_ADDED_KEYS}
            onClick={() => setKeys((current) => [...current, blankKey()])}
          >
            Add a key
          </Button>
        </VStack>
      </Box>
      <Box>
        <Text
          as="label"
          htmlFor="identity-keys-disable"
          fontSize="sm"
          color="gray.100"
          fontWeight={500}
          mb={1}
        >
          Key IDs to disable
        </Text>
        <Textarea
          id="identity-keys-disable"
          rows={2}
          fontFamily="mono"
          fontSize="xs"
          bg="gray.800"
          borderColor="gray.700"
          value={disableText}
          onChange={(e) => setDisableText(e.target.value)}
          placeholder="e.g. 4, 5, 6"
        />
        <Text fontSize="xs" color="gray.400" mt={1}>
          Master, critical-auth, and transfer keys cannot be disabled.
        </Text>
      </Box>
      {disable.error ? (
        <Text fontSize="xs" color="danger">
          {disable.error}
        </Text>
      ) : null}
    </VStack>
  );
}
