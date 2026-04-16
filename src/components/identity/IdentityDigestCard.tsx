'use client';

import { Box, Flex, HStack, Heading, Text, VStack } from '@chakra-ui/react';
import { minidenticon } from 'minidenticons';
import { useMemo } from 'react';
import { Identifier } from '@components/data/Identifier';
import { CreditsBlock } from '@components/data/CreditsBlock';
import { DigestRow } from '@components/data/DigestRow';
import { Alias } from '@components/data/Alias';
import { NotActive } from '@components/data/NotActive';
import { ProofChip } from '@components/data/ProofChip';
import { InfoBlock } from '@ui/InfoBlock';
import { useDpnsAlias } from '@sdk/useDpnsAlias';
import type { ProofState } from '@sdk/proofs';

export interface IdentityDigestCardProps {
  id: string;
  balance: bigint | null | undefined;
  revision: bigint | number | null | undefined;
  nonce: bigint | null | undefined;
  /** Every DPNS name registered for this identity. First is the primary. */
  aliases?: string[];
  proofState?: ProofState;
}

function renderTitle(alias: string | undefined) {
  if (!alias) return <>Identity</>;
  const dot = alias.lastIndexOf('.');
  if (dot <= 0) {
    return <>{alias}</>;
  }
  const label = alias.slice(0, dot);
  const tld = alias.slice(dot);
  return (
    <>
      {label}
      <Text as="span" color="gray.400" fontWeight={400}>
        {tld}
      </Text>
    </>
  );
}

export function IdentityDigestCard({
  id,
  balance,
  revision,
  nonce,
  aliases,
  proofState,
}: IdentityDigestCardProps) {
  const { alias: primaryAlias, isContested } = useDpnsAlias(id);
  const title = primaryAlias ?? aliases?.[0];
  const otherAliases = (aliases ?? []).filter((a) => a !== title);

  const svg = useMemo(() => minidenticon(id || 'null', 80, 60), [id]);
  const svgDataUrl = useMemo(
    () => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
    [svg],
  );

  return (
    <InfoBlock emphasised>
      <Flex justify="space-between" align="flex-start" gap={6} flexWrap="wrap">
        <VStack align="stretch" spacing={4} flex="1" minW={{ base: '100%', md: '360px' }}>
          <HStack spacing={3} align="center" flexWrap="wrap">
            <Heading
              as="h1"
              fontSize={{ base: '2xl', md: '3xl' }}
              color="gray.100"
              fontFamily="heading"
              fontWeight={700}
              lineHeight="1.1"
            >
              {renderTitle(title)}
            </Heading>
            {title && isContested ? (
              <Alias name="contested" status="contested" />
            ) : null}
            {proofState ? <ProofChip proofState={proofState} /> : null}
          </HStack>

          <VStack align="stretch" spacing={0}>
            <DigestRow
              label="Identifier"
              value={<Identifier value={id} avatar={false} copy highlight="both" />}
            />
            <DigestRow
              label="Balance"
              value={<CreditsBlock credits={balance ?? null} layout="inline" />}
            />
            <DigestRow
              label="Revision"
              value={
                revision !== null && revision !== undefined ? (
                  <Text fontFamily="mono" fontSize="sm" color="gray.100">
                    {String(revision)}
                  </Text>
                ) : (
                  <NotActive />
                )
              }
            />
            <DigestRow
              label="Nonce"
              value={
                nonce !== null && nonce !== undefined ? (
                  <Text fontFamily="mono" fontSize="sm" color="gray.100">
                    {String(nonce)}
                  </Text>
                ) : (
                  <NotActive />
                )
              }
            />
            {otherAliases.length > 0 ? (
              <DigestRow
                label="Identities names"
                align="flex-start"
                value={
                  <VStack align="flex-end" spacing={1}>
                    {otherAliases.map((a) => (
                      <Alias key={a} name={a} href={`/dpns/?name=${encodeURIComponent(a)}`} size="xs" />
                    ))}
                  </VStack>
                }
              />
            ) : null}
          </VStack>
        </VStack>

        <Box
          flexShrink={0}
          width={{ base: '56px', md: '96px' }}
          height={{ base: '56px', md: '96px' }}
          borderRadius="xl"
          bg="gray.750"
          border="1px solid"
          borderColor="gray.700"
          backgroundImage={`url("${svgDataUrl}")`}
          backgroundSize="cover"
          backgroundPosition="center"
          aria-hidden
        />
      </Flex>
    </InfoBlock>
  );
}
