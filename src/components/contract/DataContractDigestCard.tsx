'use client';

import { Badge, HStack, Heading, VStack, Wrap, WrapItem } from '@chakra-ui/react';
import { Identifier } from '@components/data/Identifier';
import { InfoLine } from '@components/data/InfoLine';
import { IdentityLink } from '@components/data/IdentityLink';
import { NotActive } from '@components/data/NotActive';
import { InfoBlock } from '@ui/InfoBlock';
import { useWellKnownName } from '@hooks/useWellKnownName';

export interface DataContractDigestCardProps {
  id: string;
  ownerId: string | null | undefined;
  version: number | bigint | string | null | undefined;
  documentTypeCount: number | null | undefined;
  tokenCount: number | null | undefined;
  groupCount: number | null | undefined;
}

export function DataContractDigestCard({
  id,
  ownerId,
  version,
  documentTypeCount,
  tokenCount,
  groupCount,
}: DataContractDigestCardProps) {
  const wellKnown = useWellKnownName(id);

  return (
    <InfoBlock emphasised>
      <VStack align="stretch" spacing={4}>
        <HStack justify="space-between" flexWrap="wrap" gap={3}>
          <VStack align="flex-start" spacing={2}>
            <Heading as="h1" size="md" color="gray.100">
              Data contract {wellKnown ? <Badge ml={2} colorScheme="blue" variant="subtle">{wellKnown.name}</Badge> : null}
            </Heading>
            <Identifier value={id} avatar copy highlight="both" />
          </VStack>
        </HStack>

        <Wrap spacing={8}>
          <WrapItem>
            <InfoLine
              label="Owner"
              value={ownerId ? <IdentityLink id={ownerId} dense /> : <NotActive />}
            />
          </WrapItem>
          <WrapItem>
            <InfoLine
              label="Version"
              value={
                version !== null && version !== undefined ? (
                  <Identifier value={String(version)} avatar={false} copy={false} highlight="highlight" />
                ) : (
                  <NotActive />
                )
              }
            />
          </WrapItem>
          <WrapItem>
            <InfoLine label="Document types" value={String(documentTypeCount ?? 0)} />
          </WrapItem>
          <WrapItem>
            <InfoLine label="Tokens" value={String(tokenCount ?? 0)} />
          </WrapItem>
          <WrapItem>
            <InfoLine label="Groups" value={String(groupCount ?? 0)} />
          </WrapItem>
        </Wrap>
      </VStack>
    </InfoBlock>
  );
}
