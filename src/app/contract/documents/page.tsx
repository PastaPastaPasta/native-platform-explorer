'use client';

import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  parseAsArrayOf,
  parseAsJson,
  parseAsNumberLiteral,
  parseAsString,
  useQueryStates,
} from 'nuqs';
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
import { DocumentsLanding } from '@components/contract/DocumentsLanding';
import { CursorPagination } from '@components/pagination/CursorPagination';
import { PAGE_SIZES } from '@components/pagination/PageSizeSelector';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import { useContract, useDocumentsQuery } from '@sdk/queries';
import { usePlatformProtocolVersion } from '@sdk/health';
import { shortId } from '@util/identifier';
import {
  getDocumentTypeSchema,
  getIndicesForType,
  heuristicColumnsForType,
} from '@util/schema';
import { usePageTitle } from '@hooks/usePageTitle';
import {
  buildDocumentsQuery,
  isDocumentFilterList,
  parseOrderBy,
  serializeOrderBy,
  type DocumentFilter,
  type OrderBy,
} from '@util/document-filters';

// Filters, order, page size and the cursor stack live in the URL so a filtered
// page is linkable and Back steps through pages.
const URL_STATE = {
  where: parseAsJson<DocumentFilter[]>((v) => (isDocumentFilterList(v) ? v : null)).withDefault([]),
  order: parseAsString,
  limit: parseAsNumberLiteral(PAGE_SIZES).withDefault(25),
  after: parseAsArrayOf(parseAsString).withDefault([]),
};

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
  usePageTitle(id && type ? `${type} documents` : 'Documents');

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

  const [state, setState] = useQueryStates(URL_STATE, { history: 'push' });
  const [resets, setResets] = useState(0);
  const filtersKey = JSON.stringify(state.where);
  // Value-keyed so the derived query is stable across renders.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const filters = useMemo(() => state.where, [filtersKey]);
  const orderBy = parseOrderBy(state.order);
  const orderKey = state.order ?? '';
  const limit = state.limit;
  const cursorStack = state.after;
  const startAfter = cursorStack[cursorStack.length - 1];

  const protocolVersion = usePlatformProtocolVersion();
  const built = useMemo(
    () => buildDocumentsQuery(filters, parseOrderBy(orderKey || null), docSchema, indices, protocolVersion),
    [filters, orderKey, docSchema, indices, protocolVersion],
  );

  const queryParams =
    built.errors.length === 0 && id && type && docSchema
      ? {
          dataContractId: id,
          documentTypeName: type,
          where: built.where.length ? built.where : undefined,
          orderBy: built.orderBy.length ? built.orderBy : undefined,
          limit,
          startAfter,
        }
      : undefined;

  const docsQ = useDocumentsQuery(queryParams);
  const rows = useMemo(() => extractRows(docsQ.data), [docsQ.data]);

  if (!id || !type) {
    return <DocumentsLanding initialContractId={id} />;
  }

  // Any change to the query invalidates the cursor stack: a document ID is
  // only a valid `startAfter` within the ordering that produced it.
  const applyQuery = (next: DocumentFilter[], nextOrder: OrderBy | null) =>
    void setState({ where: next, order: serializeOrderBy(nextOrder), after: [] });
  const resetFilters = () => {
    setResets((n) => n + 1); // also discard unapplied draft rows
    void setState({ where: [], order: null, after: [] });
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
              key={`${filtersKey}|${orderKey}|${resets}`}
              docSchema={docSchema}
              indices={indices}
              filters={filters}
              orderBy={orderBy}
              derivedOrderBy={built.orderByDerived ? built.orderBy[0] : null}
              errors={built.errors}
              warnings={built.warnings}
              limit={limit}
              onApply={applyQuery}
              onLimitChange={(n) => void setState({ limit: n, after: [] })}
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
                  pageIndex={cursorStack.length}
                  hasPrev={cursorStack.length > 0}
                  hasNext={rows.length === limit}
                  onPrev={() => void setState({ after: cursorStack.slice(0, -1) })}
                  onNext={() => {
                    const lastId = getLastDocId(rows);
                    if (lastId) void setState({ after: [...cursorStack, lastId] });
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
