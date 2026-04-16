'use client';

import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import NextLink from 'next/link';
import {
  Box,
  Button,
  Grid,
  Heading,
  HStack,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  VStack,
  Wrap,
  WrapItem,
} from '@chakra-ui/react';
import { Container } from '@ui/Container';
import { InfoBlock } from '@ui/InfoBlock';
import { LoadingCard } from '@ui/LoadingCard';
import { NotFoundCard } from '@ui/NotFoundCard';
import { ErrorCard } from '@ui/ErrorCard';
import { Identifier } from '@components/data/Identifier';
import { IdentityLink } from '@components/data/IdentityLink';
import { NotActive } from '@components/data/NotActive';
import { InputFilter } from '@components/filters/InputFilter';
import { ActiveFilters } from '@components/filters/ActiveFilters';
import { CursorPagination } from '@components/pagination/CursorPagination';
import { PageSizeSelector, type PageSize } from '@components/pagination/PageSizeSelector';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import { useContract, useDocumentsQuery } from '@sdk/queries';
import { shortId } from '@util/identifier';
import { readProp } from '@util/sdk-shape';
import {
  getDocumentTypeSchema,
  getIndicesForType,
  heuristicColumnsForType,
  validateWhereAgainstIndices,
} from '@util/schema';

function extractRows(data: unknown): Array<Record<string, unknown>> {
  if (!data) return [];
  if (data instanceof Map) {
    const out: Array<Record<string, unknown>> = [];
    for (const [, doc] of data) {
      if (doc && typeof doc === 'object') out.push(doc as Record<string, unknown>);
    }
    return out;
  }
  if (Array.isArray(data)) {
    return data.filter((x) => x && typeof x === 'object') as Array<Record<string, unknown>>;
  }
  return [];
}

function renderCell(
  row: Record<string, unknown>,
  col: { key: string; kind: 'identifier' | 'scalar' | 'json' },
) {
  const flatValue = readProp<unknown>(row, col.key);
  // `$id` / `$ownerId` are often exposed as getters (id / ownerId) with `$`-prefix on serialised output.
  const value =
    flatValue ??
    (col.key === '$id'
      ? readProp<unknown>(row, 'id')
      : col.key === '$ownerId'
        ? readProp<unknown>(row, 'ownerId')
        : undefined);
  if (value === null || value === undefined) return <NotActive />;
  if (col.kind === 'identifier') {
    const s = typeof value === 'string' ? value : String(value);
    return col.key === '$ownerId' ? (
      <IdentityLink id={s} dense />
    ) : (
      <Identifier value={s} dense avatar={false} />
    );
  }
  if (col.kind === 'json') {
    const s = JSON.stringify(value);
    return (
      <Text
        as="span"
        fontFamily="mono"
        fontSize="2xs"
        color="gray.250"
        noOfLines={1}
        maxW="260px"
        display="inline-block"
        verticalAlign="middle"
      >
        {s}
      </Text>
    );
  }
  return (
    <Text as="span" fontFamily="mono" fontSize="xs" color="gray.100">
      {String(value)}
    </Text>
  );
}

export default function View({
  id: fromServerId,
  type: fromServerType,
}: {
  id: string;
  type: string;
}) {
  const p = useParams<{ id: string; type: string }>();
  const id = p?.id ?? fromServerId;
  const type = p?.type ?? fromServerType;

  usePageBreadcrumbs([
    { label: 'Home', href: '/' },
    { label: 'Contract' },
    { label: shortId(id), href: `/contract/${id}/` },
    { label: 'Documents' },
    { label: type },
  ]);

  const contractQ = useContract(id);

  const docSchema = useMemo(
    () => (contractQ.data ? getDocumentTypeSchema(contractQ.data, type) : undefined),
    [contractQ.data, type],
  );
  const indices = useMemo(() => getIndicesForType(docSchema), [docSchema]);
  const columns = useMemo(() => heuristicColumnsForType(docSchema), [docSchema]);

  // Filter state: one string value per declared index property field.
  const [filters, setFilters] = useState<Record<string, string>>({});
  const activeFields = Object.entries(filters)
    .filter(([, v]) => v.trim().length > 0)
    .map(([k]) => k);

  const validation = useMemo(
    () => validateWhereAgainstIndices(activeFields, indices),
    [activeFields, indices],
  );

  const [limit, setLimit] = useState<PageSize>(25);
  const [cursorStack, setCursorStack] = useState<Array<string | undefined>>([undefined]);
  const startAfter = cursorStack[cursorStack.length - 1];

  const whereClauses: unknown[] = activeFields.map((f) => [f, '==', filters[f]!.trim()]);
  const orderBy: Array<[string, 'asc' | 'desc']> = [];

  const queryParams =
    validation.valid && id !== 'placeholder' && type !== 'placeholder'
      ? {
          dataContractId: id,
          documentTypeName: type,
          where: whereClauses.length ? whereClauses : undefined,
          orderBy: orderBy.length ? orderBy : undefined,
          limit,
          startAfter,
        }
      : undefined;

  const docsQ = useDocumentsQuery(queryParams);
  const rows = useMemo(() => extractRows(docsQ.data), [docsQ.data]);

  if (id === 'placeholder' || type === 'placeholder') {
    return (
      <Container py={8}>
        <InfoBlock>
          <Text color="gray.250">Provide a real contract id and document type in the URL.</Text>
        </InfoBlock>
      </Container>
    );
  }

  return (
    <Container py={{ base: 4, md: 6 }}>
      <VStack align="stretch" spacing={4}>
        <InfoBlock>
          <VStack align="flex-start" spacing={2}>
            <Heading size="md" color="gray.100">
              Documents · {type}
            </Heading>
            <Text fontSize="xs" color="gray.400">
              Browse documents of type <code>{type}</code> in contract{' '}
              <Identifier
                value={id}
                href={`/contract/${id}/`}
                avatar={false}
                dense
                copy={false}
              />
            </Text>
          </VStack>
        </InfoBlock>

        {contractQ.isLoading ? (
          <LoadingCard />
        ) : contractQ.isError ? (
          <ErrorCard error={contractQ.error} onRetry={() => contractQ.refetch()} />
        ) : !docSchema ? (
          <NotFoundCard
            title="Document type not found"
            description={`Contract ${shortId(id)} does not declare a document type "${type}".`}
            actions={[{ label: 'Back to contract', href: `/contract/${id}/` }]}
          />
        ) : (
          <>
            <InfoBlock>
              <VStack align="stretch" spacing={3}>
                <Heading size="sm" color="gray.100">
                  Filters
                </Heading>
                <Text fontSize="xs" color="gray.400">
                  Queries must match a declared index. Available indices:{' '}
                  {indices.map((i) => i.name).join(', ') || 'none'}.
                </Text>
                {indices.length === 0 ? (
                  <Text fontSize="sm" color="gray.400">
                    This document type declares no indices — browsing is not supported by the SDK.
                  </Text>
                ) : (
                  <Grid templateColumns={{ base: '1fr', md: 'repeat(3, 1fr)' }} gap={3}>
                    {Array.from(
                      new Set(indices.flatMap((idx) => idx.properties.map((p) => p.field))),
                    ).map((field) => (
                      <InputFilter
                        key={field}
                        label={field}
                        value={filters[field] ?? ''}
                        onChange={(v) => setFilters((prev) => ({ ...prev, [field]: v }))}
                      />
                    ))}
                  </Grid>
                )}
                <ActiveFilters
                  filters={activeFields.map((f) => ({
                    key: f,
                    label: `${f} == ${filters[f]}`,
                    onRemove: () => setFilters((prev) => ({ ...prev, [f]: '' })),
                  }))}
                />
                {!validation.valid ? (
                  <InfoBlock>
                    <Text fontSize="sm" color="warning">
                      Your current filters don&apos;t match any index on this document type.
                    </Text>
                    <Text fontSize="xs" color="gray.400" mt={2}>
                      Try one of the following combinations:
                    </Text>
                    <Wrap spacing={2} mt={1}>
                      {validation.suggestions.map((idx) => (
                        <WrapItem key={idx.name}>
                          <Box
                            px={2}
                            py={1}
                            bg="gray.800"
                            border="1px solid"
                            borderColor="gray.750"
                            borderRadius="md"
                            fontFamily="mono"
                            fontSize="xs"
                          >
                            {idx.name}: {idx.properties.map((p) => p.field).join(', ')}
                          </Box>
                        </WrapItem>
                      ))}
                    </Wrap>
                  </InfoBlock>
                ) : null}
                <HStack justify="flex-end" spacing={3}>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setFilters({});
                      setCursorStack([undefined]);
                    }}
                  >
                    Reset
                  </Button>
                  <PageSizeSelector value={limit} onChange={(n) => setLimit(n)} />
                </HStack>
              </VStack>
            </InfoBlock>

            <InfoBlock>
              {docsQ.isLoading ? (
                <LoadingCard lines={6} />
              ) : docsQ.isError ? (
                <ErrorCard error={docsQ.error} onRetry={() => docsQ.refetch()} />
              ) : rows.length === 0 ? (
                <Text color="gray.400" fontSize="sm">
                  No documents match these filters.
                </Text>
              ) : (
                <Box overflowX="auto">
                  <Table size="sm">
                    <Thead>
                      <Tr>
                        {columns.map((c) => (
                          <Th key={c.key} color="gray.400" borderColor="gray.750">
                            {c.label}
                          </Th>
                        ))}
                        <Th borderColor="gray.750" />
                      </Tr>
                    </Thead>
                    <Tbody>
                      {rows.map((row, i) => {
                        const docId = String(readProp<unknown>(row, '$id') ?? readProp<unknown>(row, 'id') ?? i);
                        return (
                          <Tr key={docId} _hover={{ bg: 'gray.800' }}>
                            {columns.map((c) => (
                              <Td key={c.key} borderColor="gray.750">
                                {renderCell(row, c)}
                              </Td>
                            ))}
                            <Td borderColor="gray.750">
                              <Button
                                as={NextLink}
                                href={`/contract/${id}/documents/${encodeURIComponent(type)}/${docId}/`}
                                size="xs"
                                variant="outline"
                                colorScheme="blue"
                              >
                                Open
                              </Button>
                            </Td>
                          </Tr>
                        );
                      })}
                    </Tbody>
                  </Table>
                </Box>
              )}
              <HStack justify="space-between" mt={3}>
                <Text fontSize="xs" color="gray.400">
                  {rows.length} document{rows.length === 1 ? '' : 's'} shown
                </Text>
                <CursorPagination
                  pageIndex={cursorStack.length - 1}
                  hasPrev={cursorStack.length > 1}
                  hasNext={rows.length === limit}
                  onPrev={() => setCursorStack((s) => s.slice(0, -1))}
                  onNext={() => {
                    const last = rows[rows.length - 1];
                    const lastId = String(
                      readProp<unknown>(last ?? {}, '$id') ?? readProp<unknown>(last ?? {}, 'id') ?? '',
                    );
                    if (lastId) setCursorStack((s) => [...s, lastId]);
                  }}
                />
              </HStack>
            </InfoBlock>
          </>
        )}
      </VStack>
    </Container>
  );
}
