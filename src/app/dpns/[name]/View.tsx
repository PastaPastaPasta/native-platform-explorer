'use client';

import { useParams } from 'next/navigation';
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
import { ErrorCard } from '@ui/ErrorCard';
import { IdentityLink } from '@components/data/IdentityLink';
import { CodeBlock } from '@components/data/CodeBlock';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import {
  useDpnsGetByName,
  useDpnsIsAvailable,
  useDpnsIsContested,
  useDpnsIsValid,
  useDpnsResolve,
} from '@sdk/queries';
import { convertToHomographSafeChars, normaliseDpnsName } from '@util/dpns';
import { SYSTEM_DATA_CONTRACTS } from '@constants/system-data-contracts';

function contestedLink(label: string): string | null {
  const dpns = SYSTEM_DATA_CONTRACTS.find((c) => c.key === 'dpns');
  if (!dpns?.testnetId) return null;
  const safe = convertToHomographSafeChars(label);
  const values = JSON.stringify(['dash', safe]);
  const encoded = encodeURIComponent(values);
  return `/governance/contested/${dpns.testnetId}/domain/parentNameAndLabel/${encoded}/`;
}

export default function View({ name: fromServer }: { name: string }) {
  const p = useParams<{ name: string }>();
  const rawName = p?.name ?? fromServer;
  const name = rawName ? normaliseDpnsName(decodeURIComponent(rawName)) : rawName;

  usePageBreadcrumbs([{ label: 'Home', href: '/' }, { label: 'DPNS' }, { label: name }]);

  const resolveQ = useDpnsResolve(name);
  const recordQ = useDpnsGetByName(name);
  const availableQ = useDpnsIsAvailable(name);
  const contestedQ = useDpnsIsContested(name);
  const validQ = useDpnsIsValid(name);

  if (name === 'placeholder') {
    return (
      <Container py={8}>
        <InfoBlock>
          <Text color="gray.250">Provide a DPNS name in the URL, e.g. /dpns/alice.dash/.</Text>
        </InfoBlock>
      </Container>
    );
  }

  const resolvedId = resolveQ.data as string | undefined;
  const available = availableQ.data as boolean | undefined;
  const contested = contestedQ.data as boolean | undefined;
  const valid = validQ.data as boolean | undefined;
  const bareLabel = name.endsWith('.dash') ? name.slice(0, -5) : name;
  const contestedUrl = contested ? contestedLink(bareLabel) : null;

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
