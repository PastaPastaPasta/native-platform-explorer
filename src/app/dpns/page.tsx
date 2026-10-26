'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import NextLink from 'next/link';
import {
  Badge,
  Button,
  Heading,
  HStack,
  Text,
  VStack,
} from '@chakra-ui/react';
import { Container } from '@ui/Container';
import { InfoBlock } from '@ui/InfoBlock';
import { LoadingCard } from '@ui/LoadingCard';
import { LookupInput } from '@ui/LookupInput';
import { ErrorCard } from '@ui/ErrorCard';
import { IdentityLink } from '@components/data/IdentityLink';
import { CodeBlock } from '@components/data/CodeBlock';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import { usePageTitle } from '@hooks/usePageTitle';
import {
  useDpnsGetByName,
  useDpnsIsAvailable,
  useDpnsIsContested,
  useDpnsIsValid,
  useDpnsResolve,
} from '@sdk/queries';
import { dpnsContestHref, normaliseDpnsName } from '@util/dpns';
import { looksLikeDpnsName } from '@util/identifier';

function Content() {
  const params = useSearchParams();
  const rawName = params.get('name') ?? '';
  const name = rawName ? normaliseDpnsName(rawName) : '';

  usePageBreadcrumbs([
    { label: 'Home', href: '/' },
    { label: 'DPNS' },
    { label: name || '—' },
  ]);
  usePageTitle(name || 'DPNS name');

  const resolveQ = useDpnsResolve(name || undefined);
  const recordQ = useDpnsGetByName(name || undefined);
  const availableQ = useDpnsIsAvailable(name || undefined);
  const contestedQ = useDpnsIsContested(name || undefined);
  const validQ = useDpnsIsValid(name || undefined);

  if (!name) {
    return (
      <Container py={{ base: 4, md: 6 }}>
        <InfoBlock emphasised>
          <VStack align="stretch" spacing={3}>
            <Heading as="h1" size="md">DPNS name</Heading>
            <LookupInput
              label="Name"
              placeholder="alice.dash or alice"
              description="Resolves the name to its identity and shows availability and contest status."
              validate={(v) => (looksLikeDpnsName(v) ? null : 'Expected a DPNS label, e.g. alice or alice.dash')}
              buildHref={(v) => `/dpns/?name=${encodeURIComponent(normaliseDpnsName(v))}`}
              buttonLabel="Resolve"
            />
            <Button as={NextLink} href="/dpns/search/" size="sm" variant="ghost" alignSelf="start">
              Search names by prefix
            </Button>
          </VStack>
        </InfoBlock>
      </Container>
    );
  }

  const resolvedId = resolveQ.data as string | undefined;
  const available = availableQ.data as boolean | undefined;
  const contested = contestedQ.data as boolean | undefined;
  const valid = validQ.data as boolean | undefined;
  const bareLabel = name.endsWith('.dash') ? name.slice(0, -5) : name;
  const contestedUrl = contested ? dpnsContestHref(bareLabel) : null;

  return (
    <Container py={{ base: 4, md: 6 }}>
      <VStack align="stretch" spacing={4}>
        <InfoBlock emphasised>
          <VStack align="flex-start" spacing={3}>
            <Heading as="h1" size="lg" color="gray.100" fontFamily="mono">
              {name}
            </Heading>
            <HStack spacing={2} flexWrap="wrap">
              {valid === false ? (
                <Badge colorScheme="red" variant="subtle">
                  invalid label
                </Badge>
              ) : null}
              {available === true ? (
                <Badge colorScheme="green" variant="subtle">
                  available
                </Badge>
              ) : null}
              {available === false && resolvedId ? (
                <Badge colorScheme="blue" variant="subtle">
                  registered
                </Badge>
              ) : null}
              {contested ? (
                <Badge colorScheme="yellow" variant="subtle">
                  contested
                </Badge>
              ) : null}
            </HStack>
          </VStack>
        </InfoBlock>

        {resolveQ.isLoading ? (
          <LoadingCard lines={3} />
        ) : resolveQ.isError ? (
          <ErrorCard error={resolveQ.error} onRetry={() => resolveQ.refetch()} />
        ) : resolvedId ? (
          <InfoBlock>
            <VStack align="flex-start" spacing={3}>
              <Heading size="sm" color="gray.100">
                Owner
              </Heading>
              <IdentityLink id={resolvedId} />
            </VStack>
          </InfoBlock>
        ) : null}

        {contestedUrl ? (
          <InfoBlock>
            <HStack justify="space-between" flexWrap="wrap" spacing={4}>
              <Text fontSize="sm" color="gray.250">
                This name is currently being contested by multiple identities.
              </Text>
              <Button
                as={NextLink}
                href={contestedUrl}
                size="sm"
                colorScheme="yellow"
                variant="outline"
              >
                View contest
              </Button>
            </HStack>
          </InfoBlock>
        ) : null}

        {recordQ.data ? (
          <InfoBlock>
            <Heading size="sm" mb={3} color="gray.100">
              DPNS record
            </Heading>
            <CodeBlock value={recordQ.data} />
          </InfoBlock>
        ) : null}
      </VStack>
    </Container>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<LoadingCard />}>
      <Content />
    </Suspense>
  );
}
