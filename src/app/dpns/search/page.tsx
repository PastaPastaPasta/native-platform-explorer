'use client';

import { Suspense, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
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
import { Alias } from '@components/data/Alias';
import { IdentityLink } from '@components/data/IdentityLink';
import { CursorPagination } from '@components/pagination/CursorPagination';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import { useDpnsPrefixSearch } from '@sdk/queries';
import { useSdk } from '@sdk/hooks';
import { SYSTEM_DATA_CONTRACTS } from '@constants/system-data-contracts';
import { convertToHomographSafeChars } from '@util/dpns';
import { idToString, readProp } from '@util/sdk-shape';

const LIMIT = 25;

function extractRows(data: unknown): Array<Record<string, unknown>> {
  if (!data) return [];
  if (data instanceof Map) {
    const out: Array<Record<string, unknown>> = [];
    for (const [, doc] of data) if (doc && typeof doc === 'object') out.push(doc as Record<string, unknown>);
    return out;
  }
  if (Array.isArray(data)) {
    return data.filter((x) => x && typeof x === 'object') as Array<Record<string, unknown>>;
  }
  return [];
}

function docIdOf(row: Record<string, unknown>): string | undefined {
  return idToString(readProp(row, 'id')) ?? idToString(readProp(row, '$id'));
}

function Content() {
  const params = useSearchParams();
  const router = useRouter();
  const q = (params.get('q') ?? '').trim();
  const [input, setInput] = useState(q);
  const [cursorStack, setCursorStack] = useState<Array<string | undefined>>([undefined]);
  const startAfter = cursorStack[cursorStack.length - 1];

  const { network } = useSdk();
  const dpns = SYSTEM_DATA_CONTRACTS.find((c) => c.key === 'dpns');
  const contractId = network === 'mainnet' ? dpns?.mainnetId : dpns?.testnetId;

  usePageBreadcrumbs([
    { label: 'Home', href: '/' },
    { label: 'DPNS' },
    { label: 'Search' },
  ]);

  // DPNS indices key off the homograph-safe form (o→0, i/l→1) and are
  // always lowercased. Normalise the prefix the same way before querying.
  const normalizedPrefix = useMemo(() => convertToHomographSafeChars(q), [q]);

  const searchQ = useDpnsPrefixSearch(
    q ? normalizedPrefix : undefined,
    contractId ?? undefined,
    LIMIT,
    startAfter,
  );
  const rows = useMemo(() => extractRows(searchQ.data), [searchQ.data]);

  const submit = () => {
    setCursorStack([undefined]);
    router.push(`/dpns/search/?q=${encodeURIComponent(input.trim())}`);
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

        <InfoBlock>
          {!contractId ? (
            <Text color="gray.400" fontSize="sm">
              No DPNS contract ID registered for {network}.
            </Text>
          ) : !q ? (
            <Text color="gray.400" fontSize="sm">
              Enter a prefix above.
            </Text>
          ) : searchQ.isLoading ? (
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
                  {rows.map((row, i) => {
                    const props =
                      (readProp<Record<string, unknown>>(row, 'properties') as
                        | Record<string, unknown>
                        | undefined) ?? {};
                    const label =
                      (props.label as string | undefined) ??
                      (props.normalizedLabel as string | undefined) ??
                      '';
                    const records = props.records as Record<string, unknown> | undefined;
                    const ownerId =
                      idToString(records?.identity) ??
                      idToString(readProp(row, 'ownerId'));
                    const key = docIdOf(row) ?? `${label}-${i}`;
                    if (!label) return null;
                    const fqdn = `${label}.dash`;
                    const normalizedFqdn =
                      ((props.normalizedLabel as string | undefined) ??
                        label.toLowerCase()) + '.dash';
                    return (
                      <Tr key={key} _hover={{ bg: 'gray.800' }}>
                        <Td borderColor="gray.750">
                          <Alias
                            name={fqdn}
                            href={`/dpns/?name=${encodeURIComponent(normalizedFqdn)}`}
                          />
                        </Td>
                        <Td borderColor="gray.750">
                          {ownerId ? <IdentityLink id={ownerId} dense /> : '—'}
                        </Td>
                      </Tr>
                    );
                  })}
                </Tbody>
              </Table>
            </Box>
          )}
          {q ? (
            <HStack justify="flex-end" mt={3}>
              <CursorPagination
                pageIndex={cursorStack.length - 1}
                hasPrev={cursorStack.length > 1}
                hasNext={rows.length === LIMIT}
                onPrev={() => setCursorStack((s) => s.slice(0, -1))}
                onNext={() => {
                  const last = rows[rows.length - 1];
                  const lastId = last ? docIdOf(last) : undefined;
                  if (lastId) setCursorStack((s) => [...s, lastId]);
                }}
              />
            </HStack>
          ) : null}
        </InfoBlock>
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
