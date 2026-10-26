'use client';

import { useState } from 'react';
import { Button, HStack, Text, VStack } from '@chakra-ui/react';
import { useSdk } from '@sdk/hooks';
import { clearPersistedSdkCache } from '@sdk/contract-cache';

/** Clear the data contracts and protocol versions evo-sdk persists in this
 *  browser, then reconnect so the next session starts fresh. */
export function ContractCacheSettings() {
  const { reconnect, status } = useSdk();
  const [cleared, setCleared] = useState<number | null>(null);
  return (
    <VStack align="stretch" spacing={2}>
      <Text fontSize="sm" color="gray.250">
        On mainnet and testnet the SDK keeps up to 100 fetched data contracts and the
        network&apos;s protocol version in this browser so pages load faster. If a document
        type added on Platform does not appear, or the network was reset to an older
        protocol, clear them. This reconnects, which disconnects a loaded signer.
      </Text>
      <HStack>
        <Button
          size="sm"
          variant="outline"
          isDisabled={status !== 'ready'}
          onClick={() => {
            setCleared(clearPersistedSdkCache());
            reconnect();
          }}
        >
          Clear SDK cache
        </Button>
        {cleared !== null ? (
          <Text role="status" fontSize="xs" color="gray.400">
            Cleared {cleared} cached contract{cleared === 1 ? '' : 's'} and the stored protocol
            versions; reconnecting.
          </Text>
        ) : null}
      </HStack>
    </VStack>
  );
}
