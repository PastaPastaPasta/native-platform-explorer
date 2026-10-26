'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { parseAsString, useQueryStates } from 'nuqs';
import {
  Box,
  Button,
  Heading,
  HStack,
  Input,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  Text,
  VStack,
} from '@chakra-ui/react';
import { Container } from '@ui/Container';
import { InfoBlock } from '@ui/InfoBlock';
import { LoadingCard } from '@ui/LoadingCard';
import { ErrorCard } from '@ui/ErrorCard';
import { DpnsNameLink } from '@components/data/DpnsNameLink';
import { IdentityLink } from '@components/data/IdentityLink';
import { CursorPagination } from '@components/pagination/CursorPagination';
import { DpnsDirectoryPanel } from '@components/identity/DpnsDirectoryPanel';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import { usePageTitle } from '@hooks/usePageTitle';
import { useDpnsPrefixSearch } from '@sdk/queries';
import { useSdk } from '@sdk/hooks';
import { dpnsContractId } from '@constants/system-data-contracts';
import { convertToHomographSafeChars, dpnsDomainRows } from '@util/dpns';
import { cursorStackParser, MAX_CURSOR_PAGES } from '@util/url-state';

const LIMIT = 25;

function Content() {
  // The prefix and the page cursors live in the URL (?q=…&after=id1,id2), so
  // a results page can be shared, reloaded, and stepped with back/forward.
  const [url, setUrl] = useQueryStates(
    { q: parseAsString.withDefault(''), after: cursorStackParser },
    { history: 'push' },
  );
  const q = url.q.trim();
  const cursors = url.after;
  const [input, setInput] = useState(q);
  useEffect(() => setInput(q), [q]);
  const startAfter = cursors[cursors.length - 1];

  const { network } = useSdk();
  const contractId = dpnsContractId(network);

  usePageBreadcrumbs([
    { label: 'Home', href: '/' },
    { label: 'DPNS' },
    { label: 'Search' },
  ]);
  usePageTitle(q ? `DPNS names starting with “${q}”` : 'DPNS search');

  // DPNS indices key off the homograph-safe form (o→0, i/l→1) and are
  // always lowercased. Normalise the prefix the same way before querying.
  const normalizedPrefix = useMemo(() => convertToHomographSafeChars(q), [q]);

  const searchQ = useDpnsPrefixSearch(
    q ? normalizedPrefix : undefined,
    contractId,
    LIMIT,
    startAfter,
  );
  const rows = useMemo(() => dpnsDomainRows(searchQ.data), [searchQ.data]);

  const submit = () => {
    void setUrl({ q: input.trim() || null, after: null });
  };

  return (
    <Container py={{ base: 4, md: 6 }}>
      <VStack align="stretch" spacing={4}>
        <InfoBlock emphasised>
          <VStack align="flex-start" spacing={3}>
            <Heading size="md" color="gray.100">
              DPNS prefix search
            </Heading>
            <Text fontSize="xs" color="gray.400" maxW="70ch">
              Prefix-matches against DPNS&apos;s homograph-safe label index. Letters
              that look like digits (<code>o</code>, <code>i</code>, <code>l</code>)
              are folded to <code>0</code> / <code>1</code> server-side — so
              searching for <code>oli</code> also matches registrations like{' '}
              <code>011</code>.
            </Text>
            <HStack width="100%" spacing={2}>
              <Input
                placeholder="label prefix, e.g. al"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    submit();
                  }
                }}
                fontFamily="mono"
                size="sm"
                bg="gray.800"
                borderColor="gray.700"
              />
              <Button size="sm" colorScheme="blue" onClick={submit}>
                Search
              </Button>
            </HStack>
            {q && q !== normalizedPrefix ? (
              <Text fontSize="xs" color="gray.400">
                Querying normalized form: <code>{normalizedPrefix}</code>
              </Text>
            ) : null}
          </VStack>
        </InfoBlock>

        {q && !contractId ? (
          <InfoBlock>
            <Text color="gray.400" fontSize="sm">
              No DPNS contract ID registered for {network}.
            </Text>
          </InfoBlock>
        ) : null}

        {q && contractId ? (
          <InfoBlock>
            {searchQ.isLoading ? (
            <LoadingCard lines={3} />
          ) : searchQ.isError ? (
            <ErrorCard error={searchQ.error} onRetry={() => searchQ.refetch()} />
          ) : rows.length === 0 ? (
            <Text color="gray.400" fontSize="sm">
              No DPNS names begin with <code>{q}</code>.
            </Text>
          ) : (
            <Box overflowX="auto">
              <Table size="sm">
                <Thead>
                  <Tr>
                    <Th color="gray.400" borderColor="gray.750">Name</Th>
                    <Th color="gray.400" borderColor="gray.750">Owner</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {rows.map((row) => (
                    <Tr key={row.docId ?? row.fqdn} _hover={{ bg: 'gray.800' }}>
                      <Td borderColor="gray.750">
                        <DpnsNameLink fqdn={row.fqdn} normalizedFqdn={row.normalizedFqdn} />
                      </Td>
                      <Td borderColor="gray.750">
                        {row.ownerId ? <IdentityLink id={row.ownerId} dense /> : '—'}
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </Box>
          )}
            <HStack justify="flex-end" mt={3}>
              <CursorPagination
                pageIndex={cursors.length}
                hasPrev={cursors.length > 0}
                hasNext={rows.length === LIMIT && cursors.length < MAX_CURSOR_PAGES}
                onPrev={() => void setUrl({ after: cursors.length > 1 ? cursors.slice(0, -1) : null })}
                onNext={() => {
                  const lastId = rows[rows.length - 1]?.docId;
                  if (lastId) void setUrl({ after: [...cursors, lastId] });
                }}
              />
            </HStack>
          </InfoBlock>
        ) : null}

        <DpnsDirectoryPanel />
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
