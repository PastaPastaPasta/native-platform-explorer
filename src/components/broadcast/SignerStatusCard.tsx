'use client';

import { Badge, Button, Heading, HStack, Text, VStack } from '@chakra-ui/react';
import { InfoBlock } from '@ui/InfoBlock';
import { IdentityLink } from '@components/data/IdentityLink';
import { CodeBlock } from '@components/data/CodeBlock';
import { useSigner } from '@/signer/SignerProvider';
import { useEffect, useState } from 'react';
import type { SignerKeyDescriptor } from '@/signer/types';

export function SignerStatusCard() {
  const { signer, disconnect } = useSigner();
  const [keys, setKeys] = useState<SignerKeyDescriptor[] | null>(null);

  useEffect(() => {
    if (!signer) {
      setKeys(null);
      return;
    }
    let cancelled = false;
    void signer.availableKeys().then((k) => {
      if (!cancelled) setKeys(k);
    });
    return () => {
      cancelled = true;
    };
  }, [signer]);

  if (!signer) return null;
  return (
    <InfoBlock emphasised>
      <VStack align="stretch" spacing={4}>
        <HStack justify="space-between" flexWrap="wrap" spacing={3}>
          <HStack spacing={3}>
            <Heading size="sm" color="gray.100">
              Signer
            </Heading>
            <Badge colorScheme="blue" variant="subtle" textTransform="none">
              {signer.kind}
            </Badge>
          </HStack>
          <Button size="sm" variant="outline" colorScheme="red" onClick={disconnect}>
            Disconnect
          </Button>
        </HStack>
        <Text fontSize="xs" color="gray.400" textTransform="uppercase">
          Identity
        </Text>
        <IdentityLink id={signer.identityId} />
        <Text fontSize="xs" color="gray.400" textTransform="uppercase">
          Available keys
        </Text>
        <CodeBlock value={keys ?? 'Loading…'} collapsedHeight={120} />
      </VStack>
    </InfoBlock>
  );
}
