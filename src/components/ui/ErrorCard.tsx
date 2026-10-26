'use client';

import { useContext } from 'react';
import { Button, Heading, HStack, Text, VStack } from '@chakra-ui/react';
import { InfoBlock } from './InfoBlock';
import { SdkContext } from '@sdk/SdkProvider';
import { classifySdkError } from '@sdk/errors';

export function ErrorCard({
  title = 'Something went wrong',
  error,
  onRetry,
}: {
  title?: string;
  error: Error | null | undefined;
  onRetry?: () => void;
}) {
  // The SDK already asked the quorum service for a quorum it had not cached
  // before failing, so the same request in this session would fail again; a
  // new session re-reads the service's quorum lists.
  const reconnect = useContext(SdkContext)?.reconnect;
  const missingQuorum = !!reconnect && classifySdkError(error) === 'missing-quorum';
  const action = missingQuorum ? reconnect : onRetry;
  return (
    <InfoBlock>
      <VStack align="flex-start" spacing={3}>
        <HStack spacing={2} color="failed">
          <Text fontFamily="mono" fontSize="sm" lineHeight={1}>
            ∅
          </Text>
          <Heading as="h2" size="sm" color="failed" textTransform="uppercase" letterSpacing="0.06em">
            {title}
          </Heading>
        </HStack>
        <Text color="muted" fontSize="sm" fontFamily="mono">
          {error?.message ?? 'Unknown error.'}
        </Text>
        {missingQuorum ? (
          <Text color="muted" fontSize="sm">
            The response names a quorum that is not in this session&apos;s trusted quorum list, so it
            could not be verified. Reconnecting fetches a fresh list, which helps after a quorum rotation.
          </Text>
        ) : null}
        {action ? (
          <Button size="sm" variant="outline" borderColor="hairlineStrong" color="ink" onClick={action}>
            {missingQuorum ? 'Reconnect' : 'Retry'}
          </Button>
        ) : null}
      </VStack>
    </InfoBlock>
  );
}
