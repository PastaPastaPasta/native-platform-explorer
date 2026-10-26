'use client';

import NextLink from 'next/link';
import { Button, HStack, Text, VStack } from '@chakra-ui/react';
import { Container } from '@ui/Container';
import { InfoBlock } from '@ui/InfoBlock';
import { Intro } from '@ui/Intro';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import { usePageTitle } from '@hooks/usePageTitle';

// The service worker serves this page in place of any page it has not cached
// when a navigation fails (PRD §14.3), so the address bar may show another
// route.
export default function Page() {
  usePageBreadcrumbs([{ label: 'Home', href: '/' }, { label: 'Offline' }]);
  usePageTitle('Offline');
  return (
    <Container py={{ base: 4, md: 6 }}>
      <Intro
        eyebrow="Offline"
        title="This page is not available offline"
        description="The page could not be loaded from the network, and this browser has not saved a copy of it since the explorer was last updated."
      />
      <InfoBlock>
        <VStack align="start" spacing={3}>
          <Text color="muted" fontSize="sm" maxW="70ch">
            Pages you have opened before still load offline, along with your saved items and settings.
            Platform data cannot be fetched or proof-verified until the connection returns.
          </Text>
          <HStack spacing={2} flexWrap="wrap">
            <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
              Try again
            </Button>
            <Button as={NextLink} href="/" size="sm" variant="ghost">
              Home
            </Button>
          </HStack>
        </VStack>
      </InfoBlock>
    </Container>
  );
}
