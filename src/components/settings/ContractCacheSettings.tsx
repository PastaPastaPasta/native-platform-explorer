'use client';

import { useState } from 'react';
import { Button, HStack, Text, VStack } from '@chakra-ui/react';
import { useSdk } from '@sdk/hooks';
import { clearPersistedContracts } from '@sdk/contract-cache';

/** Clear the data contracts evo-sdk persists in this browser, then reconnect
 *  so the next session fetches every contract fresh. */
export function ContractCacheSettings() {
  const { reconnect } = useSdk();
  const [cleared, setCleared] = useState<number | null>(null);
  return (
    <VStack align="stretch" spacing={2}>
      <Text fontSize="sm" color="gray.250">
        On mainnet and testnet the SDK keeps up to 100 fetched data contracts in this
        browser so pages load faster. If a document type or index added on Platform does
        not appear, clear them; each contract is fetched again on its next use.
      </Text>
      <HStack>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setCleared(clearPersistedContracts());
            reconnect();
          }}
        >
          Clear cached contracts
        </Button>
        {cleared !== null ? (
          <Text role="status" fontSize="xs" color="gray.400">
            Cleared {cleared} cached contract{cleared === 1 ? '' : 's'} and reconnected.
          </Text>
        ) : null}
      </HStack>
    </VStack>
  );
}
