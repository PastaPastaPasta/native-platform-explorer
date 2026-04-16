'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Heading,
  HStack,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Text,
  VStack,
} from '@chakra-ui/react';
import { Container } from '@ui/Container';
import { InfoBlock } from '@ui/InfoBlock';
import { LoadingCard } from '@ui/LoadingCard';
import { NotFoundCard } from '@ui/NotFoundCard';
import { ErrorCard } from '@ui/ErrorCard';
import { Identifier } from '@components/data/Identifier';
import { IdentityLink } from '@components/data/IdentityLink';
import { CodeBlock } from '@components/data/CodeBlock';
import { InfoLine } from '@components/data/InfoLine';
import { DateBlock } from '@components/data/DateBlock';
import { NotActive } from '@components/data/NotActive';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import { useDocument } from '@sdk/queries';
import { shortId } from '@util/identifier';
import { idToString, readProp } from '@util/sdk-shape';

function Content() {
  const params = useSearchParams();
  const id = params.get('id') ?? '';
  const type = params.get('type') ?? '';
  const docId = params.get('docId') ?? '';

  usePageBreadcrumbs([
    { label: 'Home', href: '/' },
    { label: 'Contract' },
    { label: id ? shortId(id) : '—', href: id ? `/contract/?id=${encodeURIComponent(id)}` : undefined },
    {
      label: type || '—',
      href:
        id && type
          ? `/contract/documents/?id=${encodeURIComponent(id)}&type=${encodeURIComponent(type)}`
          : undefined,
    },
    { label: docId ? shortId(docId) : '—' },
  ]);

  const q = useDocument(id || undefined, type || undefined, docId || undefined);

  if (!id || !type || !docId) {
    return (
      <Container py={8}>
        <InfoBlock>
          <Text color="gray.250">
            Provide <code>?id=…&amp;type=…&amp;docId=…</code> in the URL.
          </Text>
        </InfoBlock>
      </Container>
    );
  }

  const doc = q.data;
  const owner = idToString(readProp(doc, 'ownerId'));
  const revision = readProp<bigint | number | string>(doc, 'revision');
  const createdAt = readProp<number | bigint | Date | string>(doc, 'createdAt');
  const updatedAt = readProp<number | bigint | Date | string>(doc, 'updatedAt');
  const transferredAt = readProp<number | bigint | Date | string>(doc, 'transferredAt');
  const data = readProp<unknown>(doc, 'data') ?? doc;

  return (
    <Container py={{ base: 4, md: 6 }}>
      <VStack align="stretch" spacing={4}>
        {q.isLoading ? (
          <LoadingCard />
        ) : q.isError ? (
          <ErrorCard error={q.error} onRetry={() => q.refetch()} />
        ) : !doc ? (
          <NotFoundCard
            title="Document not found"
            description={`No document ${shortId(docId)} of type ${type} in contract ${shortId(id)}.`}
            actions={[{ label: 'Back to contract', href: `/contract/?id=${encodeURIComponent(id)}` }]}
          />
        ) : (
          <>
            <InfoBlock emphasised>
              <VStack align="stretch" spacing={3}>
                <Heading as="h1" size="md" color="gray.100">
                  {type}
                </Heading>
                <HStack spacing={4} flexWrap="wrap">
                  <InfoLine
                    label="Document ID"
                    value={<Identifier value={docId} avatar copy />}
                  />
                  <InfoLine
                    label="Owner"
                    value={owner ? <IdentityLink id={owner} dense /> : <NotActive />}
                  />
                  <InfoLine
                    label="Contract"
                    value={
                      <Identifier
                        value={id}
                        href={`/contract/?id=${encodeURIComponent(id)}`}
                        avatar={false}
                        dense
                      />
                    }
                  />
                </HStack>
              </VStack>
            </InfoBlock>

            <Tabs variant="soft-rounded" colorScheme="blue" isLazy>
              <TabList flexWrap="wrap" gap={2} borderBottom="none">
                <Tab fontSize="sm">Data</Tab>
                <Tab fontSize="sm">Metadata</Tab>
              </TabList>
              <TabPanels>
                <TabPanel px={0}>
                  <InfoBlock>
                    <CodeBlock value={data} />
                  </InfoBlock>
                </TabPanel>
                <TabPanel px={0}>
                  <InfoBlock>
                    <HStack align="flex-start" spacing={8} flexWrap="wrap">
                      <InfoLine
                        label="Revision"
                        value={revision !== undefined ? String(revision) : <NotActive />}
                      />
                      <InfoLine label="Created at" value={<DateBlock value={createdAt ?? null} />} />
                      <InfoLine label="Updated at" value={<DateBlock value={updatedAt ?? null} />} />
                      <InfoLine
                        label="Transferred at"
                        value={<DateBlock value={transferredAt ?? null} />}
                      />
                    </HStack>
                  </InfoBlock>
                </TabPanel>
              </TabPanels>
            </Tabs>
          </>
        )}
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
