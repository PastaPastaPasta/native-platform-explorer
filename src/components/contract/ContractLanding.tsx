'use client';

import NextLink from 'next/link';
import {
  Badge,
  Button,
  Heading,
  HStack,
  SimpleGrid,
  Text,
  VStack,
  Wrap,
  WrapItem,
} from '@chakra-ui/react';
import { Container } from '@ui/Container';
import { InfoBlock } from '@ui/InfoBlock';
import { LookupInput } from '@ui/LookupInput';
import { Identifier } from '@components/data/Identifier';
import { WELL_KNOWN } from '@constants/well-known';
import { isBase58Identifier } from '@util/identifier';

export function ContractLanding() {
  const wellKnownContracts = WELL_KNOWN.filter((w) => w.kind === 'contract');

  return (
    <Container py={{ base: 4, md: 6 }}>
      <VStack align="stretch" spacing={4}>
        <InfoBlock emphasised>
          <VStack align="flex-start" spacing={2}>
            <Heading size="md" color="gray.100">
              Data contracts
            </Heading>
            <Text fontSize="sm" color="gray.250" maxW="70ch">
              The SDK does not enumerate every contract on Platform — drop an ID
              below to open a contract, or pick from the curated well-known set.{' '}
              <NextLink href="/about/#enumeration" style={{ color: 'var(--chakra-colors-brand-light)' }}>
                Why no list?
              </NextLink>
            </Text>
          </VStack>
        </InfoBlock>

        <InfoBlock>
          <VStack align="stretch" spacing={3}>
            <Heading size="sm" color="gray.100">
              Open a contract by ID
            </Heading>
            <LookupInput
              label="Contract ID"
              placeholder="43–44 char base58 Identifier"
              description="Calls contracts.fetch. Example: DPNS · GWRSA…31Ec"
              validate={(v) =>
                isBase58Identifier(v) ? null : 'Expected a 43–44 char base58 string.'
              }
              buildHref={(v) => `/contract/?id=${encodeURIComponent(v)}`}
            />
          </VStack>
        </InfoBlock>

        {wellKnownContracts.length > 0 ? (
          <InfoBlock>
            <VStack align="stretch" spacing={3}>
              <HStack justify="space-between">
                <Heading size="sm" color="gray.100">
                  Well-known system contracts
                </Heading>
                <Badge variant="subtle" colorScheme="blue">
                  {wellKnownContracts.length}
                </Badge>
              </HStack>
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                {wellKnownContracts.map((w) => (
                  <InfoBlock key={w.id}>
                    <VStack align="flex-start" spacing={2}>
                      <HStack spacing={2}>
                        <Text fontWeight={600} color="gray.100">
                          {w.name}
                        </Text>
                        {w.tags?.map((t) => (
                          <Badge key={t} size="sm" colorScheme="blue" variant="subtle">
                            {t}
                          </Badge>
                        ))}
                      </HStack>
                      {w.description ? (
                        <Text fontSize="xs" color="gray.400">
                          {w.description}
                        </Text>
                      ) : null}
                      <Identifier
                        value={w.id}
                        href={`/contract/?id=${encodeURIComponent(w.id)}`}
                        dense
                      />
                    </VStack>
                  </InfoBlock>
                ))}
              </SimpleGrid>
            </VStack>
          </InfoBlock>
        ) : null}

        <InfoBlock>
          <VStack align="flex-start" spacing={2}>
            <Heading size="sm" color="gray.100">
              Related surfaces
            </Heading>
            <Wrap spacing={2}>
              <WrapItem>
                <Button as={NextLink} href="/governance/contested/" size="sm" variant="outline">
                  Contested resources
                </Button>
              </WrapItem>
              <WrapItem>
                <Button as={NextLink} href="/governance/polls/" size="sm" variant="outline">
                  Vote polls
                </Button>
              </WrapItem>
              <WrapItem>
                <Button as={NextLink} href="/about/#enumeration" size="sm" variant="ghost">
                  Why no global list?
                </Button>
              </WrapItem>
            </Wrap>
          </VStack>
        </InfoBlock>
      </VStack>
    </Container>
  );
}
