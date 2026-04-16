'use client';

import { HStack, Heading, VStack, Wrap, WrapItem } from '@chakra-ui/react';
import { Identifier } from '@components/data/Identifier';
import { CreditsBlock } from '@components/data/CreditsBlock';
import { InfoLine } from '@components/data/InfoLine';
import { Alias } from '@components/data/Alias';
import { InfoBlock } from '@ui/InfoBlock';
import { useDpnsAlias } from '@sdk/useDpnsAlias';
import { NotActive } from '@components/data/NotActive';
import { ProofChip } from '@components/data/ProofChip';
import type { ProofState } from '@sdk/proofs';

export interface IdentityDigestCardProps {
  id: string;
  balance: bigint | null | undefined;
  revision: bigint | number | null | undefined;
  nonce: bigint | null | undefined;
  proofState?: ProofState;
}

export function IdentityDigestCard({
  id,
  balance,
  revision,
  nonce,
  proofState,
}: IdentityDigestCardProps) {
  const { alias, isContested } = useDpnsAlias(id);

  return (
    <InfoBlock emphasised>
      <VStack align="stretch" spacing={4}>
        <HStack justify="space-between" flexWrap="wrap" gap={3}>
          <VStack align="flex-start" spacing={2}>
            <Heading as="h1" size="md" color="gray.100">
              Identity
            </Heading>
            <Identifier value={id} avatar copy highlight="both" />
            {alias ? (
              <Alias
                name={alias}
                status={isContested ? 'contested' : 'ok'}
                href={`/dpns/?name=${encodeURIComponent(alias)}`}
              />
            ) : null}
          </VStack>
          {proofState ? <ProofChip proofState={proofState} /> : null}
        </HStack>

        <Wrap spacing={8}>
          <WrapItem>
            <InfoLine
              label="Balance"
              value={<CreditsBlock credits={balance} />}
            />
          </WrapItem>
          <WrapItem>
            <InfoLine
              label="Revision"
              value={revision !== null && revision !== undefined ? (
                <Identifier value={String(revision)} avatar={false} copy={false} highlight="highlight" />
              ) : (
                <NotActive />
              )}
            />
          </WrapItem>
          <WrapItem>
            <InfoLine
              label="Nonce"
              value={nonce !== null && nonce !== undefined ? (
                <Identifier value={String(nonce)} avatar={false} copy={false} highlight="highlight" />
              ) : (
                <NotActive />
              )}
            />
          </WrapItem>
        </Wrap>
      </VStack>
    </InfoBlock>
  );
}
