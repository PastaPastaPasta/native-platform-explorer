'use client';

import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Heading, HStack, Text, VStack } from '@chakra-ui/react';
import { Container } from '@ui/Container';
import { InfoBlock } from '@ui/InfoBlock';
import { LoadingCard } from '@ui/LoadingCard';
import { NotFoundCard } from '@ui/NotFoundCard';
import { ErrorCard } from '@ui/ErrorCard';
import { Identifier } from '@components/data/Identifier';
import {
  DocumentsResultsTable,
  getLastDocId,
} from '@components/contract/DocumentsResultsTable';
import { DocumentsFiltersPanel } from '@components/contract/DocumentsFiltersPanel';
import { CursorPagination } from '@components/pagination/CursorPagination';
import { type PageSize } from '@components/pagination/PageSizeSelector';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import { useContract, useDocumentsQuery } from '@sdk/queries';
import { shortId } from '@util/identifier';
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

function Content() {
  const params = useSearchParams();
  const id = params.get('id') ?? '';
  const type = params.get('type') ?? '';

  usePageBreadcrumbs([
    { label: 'Home', href: '/' },
    { label: 'Contract' },
    { label: id ? shortId(id) : '—', href: id ? `/contract/?id=${encodeURIComponent(id)}` : undefined },
    { label: 'Documents' },
    { label: type || '—' },
  ]);

  const contractQ = useContract(id || undefined);

  const docSchema = useMemo(
    () => (contractQ.data && type ? getDocumentTypeSchema(contractQ.data, type) : undefined),
    [contractQ.data, type],
  );
  const indices = useMemo(() => getIndicesForType(docSchema), [docSchema]);
  const columns = useMemo(() => heuristicColumnsForType(docSchema), [docSchema]);

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

  const queryParams =
    validation.valid && id && type
      ? {
          dataContractId: id,
          documentTypeName: type,
          where: whereClauses.length ? whereClauses : undefined,
          limit,
          startAfter,
        }
      : undefined;

  const docsQ = useDocumentsQuery(queryParams);
  const rows = useMemo(() => extractRows(docsQ.data), [docsQ.data]);

  if (!id || !type) {
    return (
      <Container py={8}>
        <InfoBlock>
          <Text color="gray.250">
            Provide <code>?id=…&amp;type=…</code> in the URL.
          </Text>
        </InfoBlock>
      </Container>
    );
  }

  const resetFilters = () => {
    setFilters({});
    setCursorStack([undefined]);
  };

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
                href={`/contract/?id=${encodeURIComponent(id)}`}
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
            actions={[{ label: 'Back to contract', href: `/contract/?id=${encodeURIComponent(id)}` }]}
          />
        ) : (
          <>
            <DocumentsFiltersPanel
              indices={indices}
              filters={filters}
              onFiltersChange={setFilters}
              activeFields={activeFields}
              validation={validation}
              limit={limit}
              onLimitChange={setLimit}
              onReset={resetFilters}
            />

            <InfoBlock>
              {docsQ.isLoading ? (
                <LoadingCard lines={6} />
              ) : docsQ.isError ? (
                <ErrorCard error={docsQ.error} onRetry={() => docsQ.refetch()} />
              ) : (
                <DocumentsResultsTable
                  columns={columns}
                  rows={rows}
                  contractId={id}
                  documentType={type}
                />
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
                    const lastId = getLastDocId(rows);
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

export default function Page() {
  return (
    <Suspense fallback={<LoadingCard />}>
      <Content />
    </Suspense>
  );
}
