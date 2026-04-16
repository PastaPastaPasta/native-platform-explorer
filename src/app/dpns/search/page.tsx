'use client';

import { Suspense, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import NextLink from 'next/link';
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
import { CursorPagination } from '@components/pagination/CursorPagination';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import { useDpnsUsernamesByPrefix } from '@sdk/queries';

function Content() {
  const params = useSearchParams();
  const router = useRouter();
  const q = params.get('q') ?? '';
  const [input, setInput] = useState(q);
  const [cursorStack, setCursorStack] = useState<Array<string | undefined>>([undefined]);
  const startAfter = cursorStack[cursorStack.length - 1];

  usePageBreadcrumbs([
    { label: 'Home', href: '/' },
    { label: 'DPNS' },
    { label: 'Search' },
  ]);

  const searchQ = useDpnsUsernamesByPrefix(q || undefined, 20, startAfter);
  const results = (searchQ.data as string[] | undefined) ?? [];

  return (
    <Container py={{ base: 4, md: 6 }}>
      <VStack align="stretch" spacing={4}>
        <InfoBlock emphasised>
          <VStack align="flex-start" spacing={3}>
            <Heading size="md" color="gray.100">
              DPNS prefix search
            </Heading>
            <HStack width="100%" spacing={2}>
              <Input
                placeholder="label prefix (e.g. al)"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setCursorStack([undefined]);
                    router.push(`/dpns/search/?q=${encodeURIComponent(input.trim())}`);
                  }
                }}
                fontFamily="mono"
                size="sm"
                bg="gray.800"
                borderColor="gray.700"
              />
              <Button
                size="sm"
                colorScheme="blue"
                onClick={() => {
                  setCursorStack([undefined]);
                  router.push(`/dpns/search/?q=${encodeURIComponent(input.trim())}`);
                }}
              >
                Search
              </Button>
            </HStack>
          </VStack>
        </InfoBlock>

        <InfoBlock>
          {!q ? (
            <Text color="gray.400" fontSize="sm">
              Enter a prefix above.
            </Text>
          ) : searchQ.isLoading ? (
            <LoadingCard lines={3} />
          ) : searchQ.isError ? (
            <ErrorCard error={searchQ.error} onRetry={() => searchQ.refetch()} />
          ) : results.length === 0 ? (
            <Text color="gray.400" fontSize="sm">
              No DPNS names begin with <code>{q}</code>.
            </Text>
          ) : (
            <Box overflowX="auto">
              <Table size="sm">
                <Thead>
                  <Tr>
                    <Th color="gray.400" borderColor="gray.750">
                      Name
                    </Th>
                    <Th borderColor="gray.750" />
                  </Tr>
                </Thead>
                <Tbody>
                  {results.map((name) => (
                    <Tr key={name} _hover={{ bg: 'gray.800' }}>
                      <Td borderColor="gray.750" fontFamily="mono">
                        {name}
                      </Td>
                      <Td borderColor="gray.750" textAlign="right">
                        <Button
                          as={NextLink}
                          href={`/dpns/${encodeURIComponent(name)}/`}
                          size="xs"
                          variant="outline"
                          colorScheme="blue"
                        >
                          Open
                        </Button>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </Box>
          )}
          {q ? (
            <HStack justify="flex-end" mt={3}>
              <CursorPagination
                pageIndex={cursorStack.length - 1}
                hasPrev={cursorStack.length > 1}
                hasNext={results.length === 20}
                onPrev={() => setCursorStack((s) => s.slice(0, -1))}
                onNext={() => {
                  const last = results[results.length - 1];
                  if (last) setCursorStack((s) => [...s, last]);
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
