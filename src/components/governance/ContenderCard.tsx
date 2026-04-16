'use client';

import { HStack, VStack, Text, Badge } from '@chakra-ui/react';
import { IdentityLink } from '@components/data/IdentityLink';
import { InfoLine } from '@components/data/InfoLine';
import { CreditsBlock } from '@components/data/CreditsBlock';
import { InfoBlock } from '@ui/InfoBlock';

export interface ContenderCardProps {
  identityId: string;
  prefundedBalance?: bigint | null;
  isWinner?: boolean;
  documentPreview?: unknown;
  voteCount?: number;
}

export function ContenderCard({
  identityId,
  prefundedBalance,
  isWinner,
  voteCount,
}: ContenderCardProps) {
  return (
    <InfoBlock>
      <VStack align="stretch" spacing={3}>
        <HStack justify="space-between" flexWrap="wrap" spacing={2}>
          <IdentityLink id={identityId} />
          {isWinner ? (
            <Badge colorScheme="green" variant="subtle">
              winner
            </Badge>
          ) : null}
        </HStack>
        <HStack spacing={8} flexWrap="wrap">
          <InfoLine
            label="Prefunded balance"
            value={<CreditsBlock credits={prefundedBalance ?? null} stacked={false} showUsd={false} />}
          />
          {voteCount !== undefined ? (
            <InfoLine
              label="Votes"
              value={
                <Text fontFamily="mono" fontSize="md" color="gray.100">
                  {voteCount}
                </Text>
              }
            />
          ) : null}
        </HStack>
      </VStack>
    </InfoBlock>
  );
}
