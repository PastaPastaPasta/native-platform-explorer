'use client';

import { Button, HStack, Heading, Text, VStack } from '@chakra-ui/react';
import { InfoBlock } from '@ui/InfoBlock';
import { useSdk } from '@sdk/hooks';
import { useSigner } from '@/signer/SignerProvider';
import { getBridgeUrl } from '@util/bridge';

export function BridgeLaunchCard() {
  const { network } = useSdk();
  const { signer } = useSigner();
  const bridgeUrl = getBridgeUrl(network);

  if (!bridgeUrl) {
    return (
      <InfoBlock>
        <VStack align="flex-start" spacing={2}>
          <Heading size="sm" color="gray.100">
            Bridge shortcut unavailable
          </Heading>
          <Text fontSize="sm" color="gray.250">
            Import your bridge backup JSON above. Bridge shortcuts require an enabled Mainnet or
            Testnet bridge; other networks need their own setup.
          </Text>
        </VStack>
      </InfoBlock>
    );
  }

  return (
    <InfoBlock>
      <VStack align="flex-start" spacing={3}>
        <Heading size="sm" color="gray.100">
          Need an identity?
        </Heading>
        <Text fontSize="sm" color="gray.250">
          Identities are created in the Dash Platform bridge — it converts L1 DASH into Platform
          credits and registers the identity. Open the bridge and choose Create New Identity. Come
          back with the backup JSON and drop it in the import box above.
        </Text>
        <HStack spacing={2} flexWrap="wrap">
          <Button
            as="a"
            size="sm"
            colorScheme="blue"
            href={bridgeUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Create new identity →
          </Button>
          {signer ? (
            <Button
              as="a"
              size="sm"
              variant="outline"
              href={bridgeUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Top up {signer.identityId.slice(0, 6)}… →
            </Button>
          ) : null}
        </HStack>
        <Text fontSize="xs" color="gray.400">
          Bridge: {new URL(bridgeUrl).host}. For a top-up, choose Manage Identity, then Top Up
          Identity, and enter your identity there.
        </Text>
      </VStack>
    </InfoBlock>
  );
}
