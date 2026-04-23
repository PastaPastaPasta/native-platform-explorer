'use client';

import NextLink from 'next/link';
import {
  Button,
  Heading,
  Text,
  VStack,
  Wrap,
  WrapItem,
} from '@chakra-ui/react';
import { Container } from '@ui/Container';
import { InfoBlock } from '@ui/InfoBlock';
import { LookupInput } from '@ui/LookupInput';
import { WELL_KNOWN } from '@constants/well-known';
import { Identifier } from '@components/data/Identifier';
import { TokenDiscoveryPanel } from '@components/token/TokenDiscoveryPanel';
import { isBase58Identifier } from '@util/identifier';

export function TokenLanding() {
  const wellKnownTokens = WELL_KNOWN.filter((w) => w.kind === 'token');

  return (
    <Container py={{ base: 4, md: 6 }}>
      <VStack align="stretch" spacing={4}>
        <InfoBlock emphasised>
          <VStack align="flex-start" spacing={2}>
            <Heading size="md" color="gray.100">
              Tokens
            </Heading>
            <Text fontSize="sm" color="gray.250" maxW="70ch">
              The SDK can&apos;t enumerate every token, but a token ID alone is now
              enough to surface everything: the owning contract, the token&apos;s name
              and decimals, supply, status, price, and scoped holders. We resolve the
              owning contract through the GroveDB reverse index at{' '}
              <code>[RootTree::Tokens, TOKEN_CONTRACT_INFO_KEY]</code>, then read the
              token configuration out of the contract.{' '}
              <NextLink href="/about/#enumeration" style={{ color: 'var(--chakra-colors-brand-light)' }}>
                Why no list?
              </NextLink>
            </Text>
          </VStack>
        </InfoBlock>

        <InfoBlock>
          <VStack align="stretch" spacing={3}>
            <Heading size="sm" color="gray.100">
              Open a token by ID
            </Heading>
            <LookupInput
              label="Token ID"
              placeholder="43–44 char base58 Identifier"
              description="Resolves the owning contract via tokens.contractInfo, then pulls supply, status, price, and the full token configuration."
              validate={(v) =>
                isBase58Identifier(v) ? null : 'Expected a 43–44 char base58 string.'
              }
              buildHref={(v) => `/token/?id=${encodeURIComponent(v)}`}
            />
          </VStack>
        </InfoBlock>

        {wellKnownTokens.length > 0 ? (
          <InfoBlock>
            <Heading size="sm" color="gray.100" mb={3}>
              Well-known tokens
            </Heading>
            <Wrap spacing={2}>
              {wellKnownTokens.map((w) => (
                <WrapItem key={w.id}>
                  <Identifier
                    value={w.id}
                    href={`/token/?id=${encodeURIComponent(w.id)}`}
                    dense
                  />
                </WrapItem>
              ))}
            </Wrap>
          </InfoBlock>
        ) : null}

        <TokenDiscoveryPanel />

        <InfoBlock>
          <VStack align="flex-start" spacing={2}>
            <Heading size="sm" color="gray.100">
              Find tokens via a contract
            </Heading>
            <Text fontSize="sm" color="gray.250">
              Tokens live inside data contracts. Open a contract that declares tokens
              (its Tokens tab lists every defined position) to drill in. The home
              dashboard also links the well-known contracts.
            </Text>
            <Wrap spacing={2}>
              <WrapItem>
                <Button as={NextLink} href="/contract/" size="sm" variant="outline">
                  Open a contract
                </Button>
              </WrapItem>
              <WrapItem>
                <Button as={NextLink} href="/" size="sm" variant="ghost">
                  Home dashboard
                </Button>
              </WrapItem>
            </Wrap>
          </VStack>
        </InfoBlock>
      </VStack>
    </Container>
  );
}
