'use client';

import { Button, HStack, Heading, Text, VStack } from '@chakra-ui/react';
import { InfoBlock } from '@ui/InfoBlock';
import { useSdk } from '@sdk/hooks';
import { useSigner } from '@/signer/SignerProvider';

const BRIDGE_BASE_URL =
  process.env.NEXT_PUBLIC_BRIDGE_URL?.replace(/\/+$/, '') ||
  'https://platform-bridge.dash.org';

function buildBridgeUrl(params: Record<string, string | undefined>): string {
  const qp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) qp.set(k, v);
  }
  const q = qp.toString();
  return q ? `${BRIDGE_BASE_URL}/?${q}` : `${BRIDGE_BASE_URL}/`;
}

export function BridgeLaunchCard() {
  const { network } = useSdk();
  const { signer } = useSigner();

  return (
    <InfoBlock>
      <VStack align="flex-start" spacing={3}>
        <Heading size="sm" color="gray.100">
          Need an identity?
        </Heading>
        <Text fontSize="sm" color="gray.250">
          Identities are created in the Dash Platform bridge — it converts
          L1 DASH into Platform credits and registers the identity. Come back
          here when you have the backup JSON and drop it in the import box
          above.
        </Text>
        <HStack spacing={2} flexWrap="wrap">
          <Button
            as="a"
            size="sm"
            colorScheme="blue"
            href={buildBridgeUrl({ network })}
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
              href={buildBridgeUrl({
                network,
                mode: 'topup',
                identityId: signer.identityId,
              })}
              target="_blank"
              rel="noopener noreferrer"
            >
              Top up {signer.identityId.slice(0, 6)}… →
            </Button>
          ) : null}
        </HStack>
        <Text fontSize="xs" color="gray.400">
          Bridge URL: {BRIDGE_BASE_URL}
        </Text>
      </VStack>
    </InfoBlock>
  );
}
