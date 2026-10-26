'use client';

import { useState } from 'react';
import { Button, Heading, HStack, Input, Text, VStack } from '@chakra-ui/react';
import { ErrorCard } from '@ui/ErrorCard';
import { InfoLine } from '@components/data/InfoLine';
import { PublicKeysTable } from './PublicKeysTable';
import { useIdentityContractKeys, useIdentityContractNonce } from '@sdk/queries';
import { readProp } from '@util/sdk-shape';

/** `identities.contractKeys` → the keys of the one identity queried. */
export function contractKeysFor(data: unknown): unknown[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((entry) => {
    const keys = readProp<unknown>(entry, 'keys');
    return Array.isArray(keys) ? keys : [];
  });
}

/** Per-contract state for one identity: its contract nonce and the keys it
 *  has bound to the contract. */
export function IdentityContractLookup({ identityId }: { identityId: string }) {
  const [contractId, setContractId] = useState('');
  const [target, setTarget] = useState<string | undefined>(undefined);
  const nonceQ = useIdentityContractNonce(identityId, target);
  const keysQ = useIdentityContractKeys(identityId, target);
  const submit = () => setTarget(contractId.trim() || undefined);
  const keys = contractKeysFor(keysQ.data);

  return (
    <VStack align="stretch" spacing={3} w="full">
      <Text fontSize="sm" color="gray.250">
        Look up this identity&apos;s state for one contract: its contract nonce (the replay counter for
        document transitions) and any keys bound to the contract.
      </Text>
      <HStack spacing={2}>
        <Input
          size="sm"
          placeholder="Contract ID"
          aria-label="Contract ID for nonce and key lookup"
          value={contractId}
          onChange={(e) => setContractId(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          fontFamily="mono"
          bg="gray.800"
          borderColor="gray.700"
        />
        <Button size="sm" colorScheme="blue" onClick={submit} isDisabled={contractId.trim().length === 0}>
          Look up
        </Button>
      </HStack>
      {target ? (
        <VStack align="stretch" spacing={3}>
          <InfoLine
            label="Contract nonce"
            value={nonceQ.isLoading ? <Text color="gray.400">…</Text>
              : nonceQ.isError ? <ErrorCard error={nonceQ.error} onRetry={() => nonceQ.refetch()} />
                : <Text fontFamily="mono" color="gray.100">{nonceQ.data === null || nonceQ.data === undefined ? 'none (never used)' : String(nonceQ.data)}</Text>}
          />
          <VStack align="stretch" spacing={2}>
            <Heading size="xs" color="gray.100">Contract-bound keys</Heading>
            {keysQ.isLoading ? (
              <Text color="gray.400" fontSize="xs">…</Text>
            ) : keysQ.isError ? (
              <ErrorCard error={keysQ.error} onRetry={() => keysQ.refetch()} />
            ) : keys.length === 0 ? (
              <Text fontSize="sm" color="gray.400">
                No keys bound to this contract. Contracts that require an encryption or decryption key
                (see the contract&apos;s Internal tab) have identities add keys with contract bounds.
              </Text>
            ) : (
              <PublicKeysTable keys={keys as never} />
            )}
          </VStack>
        </VStack>
      ) : null}
    </VStack>
  );
}
