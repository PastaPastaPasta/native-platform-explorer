'use client';

import NextLink from 'next/link';
import {
  Button,
  Heading,
  HStack,
  SimpleGrid,
  Text,
  VStack,
} from '@chakra-ui/react';
import { Container } from '@ui/Container';
import { InfoBlock } from '@ui/InfoBlock';
import { LookupInput } from '@ui/LookupInput';
import { IdentityLink } from '@components/data/IdentityLink';
import { useViewedIdentities } from '@hooks/useViewedIdentities';
import {
  isBase58Identifier,
  isPublicKeyHash,
  looksLikeDpnsName,
} from '@util/identifier';
import { normaliseDpnsName } from '@util/dpns';

export function IdentityLanding() {
  const { ids: viewedIds, consent } = useViewedIdentities();

  return (
    <Container py={{ base: 4, md: 6 }}>
      <VStack align="stretch" spacing={4}>
        <InfoBlock emphasised>
          <VStack align="flex-start" spacing={2}>
            <Heading size="md" color="gray.100">
              Identities
            </Heading>
            <Text fontSize="sm" color="gray.250" maxW="70ch">
              Dash Platform&apos;s SDK does not publish a global list of identities, so
              this explorer can&apos;t show every identity on-chain. Instead, use one of
              the lookups below — any identity is one query away when you have an
              identifier, a public-key hash, or a DPNS name.{' '}
              <NextLink href="/about/#enumeration" style={{ color: 'var(--chakra-colors-brand-light)' }}>
                Why no list?
              </NextLink>
            </Text>
          </VStack>
        </InfoBlock>

        <InfoBlock>
          <VStack align="stretch" spacing={4}>
            <Heading size="sm" color="gray.100">
              Look up an identity
            </Heading>
            <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
              <LookupInput
                label="By identity ID"
                placeholder="43–44 char base58 Identifier"
                description="Direct identity.fetch. Example: GWRSAVFMj…31Ec"
                validate={(v) =>
                  isBase58Identifier(v) ? null : 'Expected a 43–44 char base58 string.'
                }
                buildHref={(v) => `/identity/?id=${encodeURIComponent(v)}`}
              />
              <LookupInput
                label="By public-key hash"
                placeholder="40-char hex"
                description="identities.byPublicKeyHash, falls back to non-unique."
                validate={(v) =>
                  isPublicKeyHash(v) ? null : 'Expected a 40-char hex string.'
                }
                buildHref={(v) => `/identity/lookup/?pkh=${encodeURIComponent(v)}`}
              />
              <LookupInput
                label="By DPNS name"
                placeholder="alice.dash or alice"
                description="dpns.resolveName → identity."
                validate={(v) =>
                  looksLikeDpnsName(v) ? null : 'Expected a DPNS label, e.g. alice or alice.dash'
                }
                buildHref={(v) => `/dpns/?name=${encodeURIComponent(normaliseDpnsName(v))}`}
                buttonLabel="Resolve"
              />
            </SimpleGrid>
          </VStack>
        </InfoBlock>

        {viewedIds.length > 0 ? (
          <InfoBlock>
            <VStack align="stretch" spacing={3}>
              <HStack justify="space-between">
                <Heading size="sm" color="gray.100">
                  Recently viewed
                </Heading>
                <Text fontSize="xs" color="gray.400">
                  {viewedIds.length} in this browser
                </Text>
              </HStack>
              <VStack align="stretch" spacing={2}>
                {viewedIds.slice(0, 25).map((id) => (
                  <HStack key={id} spacing={2} py={1}>
                    <IdentityLink id={id} dense />
                  </HStack>
                ))}
              </VStack>
            </VStack>
          </InfoBlock>
        ) : !consent ? (
          <InfoBlock>
            <Text fontSize="sm" color="gray.400">
              Tip: enable the opt-in &quot;remember identities&quot; log on any identity
              page to auto-build a local recent list here.
            </Text>
          </InfoBlock>
        ) : null}

        <InfoBlock>
          <VStack align="flex-start" spacing={2}>
            <Heading size="sm" color="gray.100">
              Related surfaces
            </Heading>
            <HStack spacing={2} flexWrap="wrap">
              <Button as={NextLink} href="/dpns/search/" size="sm" variant="outline">
                DPNS prefix search
              </Button>
              <Button as={NextLink} href="/governance/contested/" size="sm" variant="outline">
                Contested resources
              </Button>
              <Button as={NextLink} href="/about/#enumeration" size="sm" variant="ghost">
                Why no global list?
              </Button>
            </HStack>
          </VStack>
        </InfoBlock>
      </VStack>
    </Container>
  );
}
