'use client';

import { useState } from 'react';
import NextLink from 'next/link';
import {
  Badge, Box, Button, Code, Heading, HStack, Input, Link, Select,
  Table, TableContainer, Tbody, Td, Text, Th, Thead, Tr, VStack,
} from '@chakra-ui/react';
import { Container } from '@ui/Container';
import { InfoBlock } from '@ui/InfoBlock';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import reference from '@/data/sdk-reference.json';
import { filterReference } from './reference';

const KIND_LABELS: Record<string, string> = {
  facade: 'EvoSDK',
  wasm: 'Direct WASM',
  utility: 'SDK utility',
};

export function SdkReference() {
  usePageBreadcrumbs([{ label: 'Home', href: '/' }, { label: 'SDK reference' }]);
  const [query, setQuery] = useState('');
  const [route, setRoute] = useState('');
  const pages = filterReference(reference.pages, query, route);

  return (
    <Container py={{ base: 4, md: 6 }}>
      <VStack align="stretch" spacing={4}>
        <InfoBlock emphasised>
          <Heading as="h1" size="lg" mb={3}>SDK reference</Heading>
          <Text color="gray.250">
            Find the SDK calls used by each explorer page, including its tabs and actions.
            This mapping is generated from the application source for{' '}
            <Code>{reference.sdkPackage}@{reference.sdkVersion}</Code>.
          </Text>
          <Text fontSize="sm" color="gray.400" mt={3}>
            Calls depend on inputs, SDK readiness, the selected tab, and operation availability.
            Shared network connection setup and methods on returned SDK objects are outside this list.
            Browsing this reference does not run the listed calls.
          </Text>
        </InfoBlock>

        <InfoBlock>
          <Heading as="h2" size="sm" mb={2}>Proof paths</Heading>
          <Text fontSize="sm" color="gray.250">
            Most query hooks select a <Code>WithProof</Code> call when trusted mode and the
            Query Inspector are enabled. Ordinary trusted calls can verify internally without
            returning proof bytes. Current epoch reads use <Code>epoch.epochsInfoWithProof</Code>{' '}
            whenever trusted mode is on, deriving explicit epoch bounds from proved genesis and
            the response&apos;s signed time. That does not establish newest signed-root freshness.
            Direct WASM document aggregates have no proof capture variant in this app.
          </Text>
        </InfoBlock>

        <HStack align="stretch" flexWrap={{ base: 'wrap', md: 'nowrap' }} spacing={3}>
          <Input
            aria-label="Search pages or SDK calls"
            placeholder="Search a page, method, or hook"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            flex="2"
            minW="220px"
          />
          <Select aria-label="Filter by page" value={route} onChange={(event) => setRoute(event.target.value)} flex="1" minW="180px">
            <option value="">All pages</option>
            {reference.pages.map((page) => <option key={page.route} value={page.route}>{page.route}</option>)}
          </Select>
          <Button variant="outline" onClick={() => { setQuery(''); setRoute(''); }} isDisabled={!query && !route}>
            Clear filters
          </Button>
        </HStack>
        <Text role="status" fontSize="sm" color="gray.400">
          {pages.length} of {reference.pages.length} pages
        </Text>
        {pages.length === 0 ? (
          <InfoBlock><Text>No pages or SDK calls match these filters.</Text></InfoBlock>
        ) : pages.map((page) => (
          <InfoBlock as="section" aria-label={page.route} key={page.route}>
            <Heading as="h2" size="md" mb={2}>
              <Link as={NextLink} href={page.route} color="brand.light">{page.route}</Link>
            </Heading>
            {page.route === '/broadcast/' ? (
              <Text fontSize="sm" color="gray.400" mb={3}>
                Write calls require an available operation, eligible signer, review and confirmation.
                Identity top-up opens the external bridge; voting and raw byte submission are unavailable.
              </Text>
            ) : page.route === '/query/' ? (
              <Text fontSize="sm" color="gray.400" mb={3}>
                Document queries and COUNT, SUM or AVG aggregates follow the selected statement.
                Contract calls also supply schema assistance.
              </Text>
            ) : null}
            {page.calls.length === 0 ? (
              <Text fontSize="sm" color="gray.400">No page-specific SDK calls. This page uses local data, settings, or navigation.</Text>
            ) : (
              <TableContainer>
                <Table size="sm">
                  <Thead><Tr><Th>SDK call</Th><Th>Interface</Th><Th>Used by</Th></Tr></Thead>
                  <Tbody>{page.calls.map((call) => (
                    <Tr key={`${call.kind}:${call.method}`}>
                      <Td verticalAlign="top">
                        <Code whiteSpace="normal" overflowWrap="anywhere">{call.method}</Code>
                        {call.method.endsWith('WithProof') ? <Badge display="block" width="fit-content" mt={1} textTransform="none">Explicit proof path</Badge> : null}
                      </Td>
                      <Td verticalAlign="top">{KIND_LABELS[call.kind] ?? call.kind}</Td>
                      <Td whiteSpace="normal">
                        {call.sources.map((source) => (
                          <Box key={`${source.file}:${source.line}`} mb={1}>
                            <Text fontSize="xs" color="gray.250">{source.owner}</Text>
                            <Text fontFamily="mono" fontSize="2xs" color="gray.400" overflowWrap="anywhere">{source.file}:{source.line}</Text>
                          </Box>
                        ))}
                      </Td>
                    </Tr>
                  ))}</Tbody>
                </Table>
              </TableContainer>
            )}
          </InfoBlock>
        ))}
      </VStack>
    </Container>
  );
}
