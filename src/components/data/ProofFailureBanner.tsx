'use client';

import { Button, Heading, HStack, Text, VStack } from '@chakra-ui/react';
import { InfoBlock } from '@ui/InfoBlock';
import type { ProofState } from '@sdk/proofs';

export interface ProofFailureBannerProps {
  proofState: ProofState;
  onRetry?: () => void;
  onViewUnverified?: () => void;
  onOpenDiagnostics?: () => void;
}

export function ProofFailureBanner({
  proofState,
  onRetry,
  onViewUnverified,
  onOpenDiagnostics,
}: ProofFailureBannerProps) {
  if (proofState.kind !== 'failed') return null;
  return (
    <InfoBlock>
      <VStack align="stretch" spacing={3}>
        <Heading as="h2" size="sm" color="danger">
          Proof verification failed
        </Heading>
        <Text fontSize="sm" color="gray.250">
          One or more values on this page did not verify against the current quorum
          public keys. The data shown below is unverified.
        </Text>
        <Text fontSize="xs" color="gray.400" fontFamily="mono">
          {proofState.error}
        </Text>
        <HStack spacing={2}>
          {onRetry ? (
            <Button size="sm" colorScheme="blue" onClick={onRetry}>
              Retry with proofs
            </Button>
          ) : null}
          {onViewUnverified ? (
            <Button size="sm" variant="outline" onClick={onViewUnverified}>
              View unverified
            </Button>
          ) : null}
          {onOpenDiagnostics ? (
            <Button size="sm" variant="ghost" onClick={onOpenDiagnostics}>
              Open diagnostics
            </Button>
          ) : null}
        </HStack>
      </VStack>
    </InfoBlock>
  );
}
