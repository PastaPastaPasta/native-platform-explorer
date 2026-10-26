'use client';

import { Button, HStack, Text, VStack } from '@chakra-ui/react';
import { InfoBlock } from '@ui/InfoBlock';
import { useSdk } from '@sdk/hooks';
import { getBridgeUrl } from '@util/bridge';

/** The Dash Platform bridge builds the asset lock for users without a Core wallet. */
export function BridgeHandoff({ action }: { action: 'create' | 'topUp' }) {
  const { network } = useSdk();
  const bridgeUrl = getBridgeUrl(network);
  return (
    <InfoBlock>
      <VStack align="stretch" spacing={2}>
        <Text fontSize="sm" color="gray.100" fontWeight={500}>
          Recommended without a Core wallet: the bridge
        </Text>
        <Text fontSize="xs" color="gray.250">
          {action === 'create'
            ? 'An identity is funded by a Dash asset-lock transaction. The bridge builds and funds it for you and creates the identity; choose Create Identity there.'
            : 'A top-up spends a Dash asset-lock transaction. The bridge builds and funds it for you; choose Manage Identity, then Top Up Identity, and enter the identity there.'}{' '}
          Afterwards, return here and refresh the identity page.
        </Text>
        {bridgeUrl ? (
          <HStack>
            <Button
              as="a"
              size="sm"
              colorScheme="blue"
              href={bridgeUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open bridge →
            </Button>
          </HStack>
        ) : (
          <Text fontSize="xs" color="warning">
            The bridge shortcut is unavailable. It requires an enabled Mainnet or Testnet bridge;
            other networks need their own setup.
          </Text>
        )}
      </VStack>
    </InfoBlock>
  );
}
