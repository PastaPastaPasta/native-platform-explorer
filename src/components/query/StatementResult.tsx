'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  AlertDescription,
  AlertIcon,
  Box,
  Code,
  Collapse,
  HStack,
  IconButton,
  Text,
  VStack,
} from '@chakra-ui/react';
import { ChevronDownIcon, ChevronUpIcon } from '@chakra-ui/icons';
import { InfoBlock } from '@ui/InfoBlock';
import { LoadingCard } from '@ui/LoadingCard';
import {
  useContract,
  useDocumentsQuery,
  useDocumentsCount,
  useDocumentsSum,
  useDocumentsAverage,
} from '@sdk/queries';
import {
  resolveContractId,
  toDocumentsQuery,
  type ParsedQuery,
} from '@util/sql-parser';
import {
  getDocumentTypeSchema,
  getIndicesForType,
  getPropertySchema,
  heuristicColumnsForType,
  validateWhereAgainstIndices,
} from '@util/schema';
import { SYSTEM_DATA_CONTRACTS } from '@constants/system-data-contracts';
import { QueryResults } from './QueryResults';
import { AggregateResults, type AggregateResultMap } from './AggregateResults';

export interface StatementResultProps {
  parsed: ParsedQuery;
  /** Contract picked in the UI; only used when the statement doesn't carry
   *  its own `alias.docType` FROM clause. */
  pickerContractId: string | undefined;
  /** When the surrounding page only has one statement, expose cursor
   *  pagination for document queries; multi-statement mode disables it. */
  cursorStack?: Array<string | undefined>;
  onCursorStackChange?: (stack: Array<string | undefined>) => void;
}

export function StatementResult({
  parsed,
  pickerContractId,
  cursorStack,
  onCursorStackChange,
}: StatementResultProps) {
  const [showParams, setShowParams] = useState(false);

  const { contractId: effectiveContractId, source: contractSource } = useMemo(() => {
    return resolveContractId(parsed, pickerContractId);
  }, [parsed, pickerContractId]);

  const aliasError = parsed.contractAlias && !effectiveContractId
    ? `Unknown contract alias '${parsed.contractAlias}'. Available: ${SYSTEM_DATA_CONTRACTS.map((c) => c.key).join(', ')}`
    : null;

  const contractQ = useContract(effectiveContractId || undefined);
  const docSchema = useMemo(
    () => (contractQ.data ? getDocumentTypeSchema(contractQ.data, parsed.from) : undefined),
    [contractQ.data, parsed],
  );
  const indices = useMemo(() => getIndicesForType(docSchema), [docSchema]);
  const columns = useMemo(() => heuristicColumnsForType(docSchema), [docSchema]);
  const groupBySchemas = useMemo(() => {
    if (!parsed.groupBy || parsed.groupBy.length === 0) return undefined;
    return parsed.groupBy.map((f) => getPropertySchema(docSchema, f));
  }, [parsed, docSchema]);

  const whereFields = parsed.where.map((w) => w.field);
  const validation = useMemo(
    () => validateWhereAgainstIndices(whereFields, indices),
    [whereFields, indices],
  );

  // Pagination only makes sense for single-statement document queries.
  const paginationEnabled = !!cursorStack && !!onCursorStackChange;
  const startAfter = paginationEnabled ? cursorStack![cursorStack!.length - 1] : undefined;

  const queryParams = useMemo(() => {
    if (!effectiveContractId || aliasError) return undefined;
    if (parsed.select !== 'documents') return undefined;
    return toDocumentsQuery(parsed, effectiveContractId, { startAfter });
  }, [parsed, effectiveContractId, aliasError, startAfter]);

  const aggregateParams = useMemo(() => {
    if (!effectiveContractId || aliasError) return undefined;
    if (parsed.select === 'documents') return undefined;
    return toDocumentsQuery(parsed, effectiveContractId);
  }, [parsed, effectiveContractId, aliasError]);

  const docsQ = useDocumentsQuery(queryParams);
  const countQ = useDocumentsCount(parsed.select === 'count' ? aggregateParams : undefined);
  const sumQ = useDocumentsSum(
    parsed.select === 'sum' ? aggregateParams : undefined,
    parsed.select === 'sum' ? parsed.aggregateField : undefined,
  );
  const avgQ = useDocumentsAverage(
    parsed.select === 'avg' ? aggregateParams : undefined,
    parsed.select === 'avg' ? parsed.aggregateField : undefined,
  );

  const activeAggQ =
    parsed.select === 'count' ? countQ
    : parsed.select === 'sum' ? sumQ
    : parsed.select === 'avg' ? avgQ
    : null;

  const limit = parsed.limit ?? 25;
  const isAggregate = parsed.select !== 'documents';
  const previewParams = isAggregate ? aggregateParams : queryParams;
  const resolvedAlias = contractSource === 'alias' ? parsed.contractAlias : undefined;

  return (
    <VStack align="stretch" spacing={3}>
      {/* Statement header — small label so users can tell which statement is which. */}
      <HStack spacing={2}>
        <Text fontSize="2xs" color="gray.500" fontFamily="mono">
          {parsed.select === 'documents'
            ? 'SELECT *'
            : parsed.select === 'count'
            ? 'COUNT(*)'
            : `${parsed.select.toUpperCase()}(${parsed.aggregateField ?? '?'})`
          }
          {' FROM '}
          {resolvedAlias ? `${resolvedAlias}.` : ''}{parsed.from}
          {parsed.where.length > 0 && ' WHERE …'}
          {parsed.groupBy && parsed.groupBy.length > 0 && ` GROUP BY ${parsed.groupBy.join(', ')}`}
        </Text>
      </HStack>

      {aliasError && (
        <Alert status="error" borderRadius="md" bg="rgba(255,0,0,0.08)">
          <AlertIcon />
          <AlertDescription fontSize="sm">{aliasError}</AlertDescription>
        </Alert>
      )}

      {whereFields.length > 0 && !validation.valid && !!contractQ.data && docSchema && (
        <Alert status="warning" borderRadius="md" bg="rgba(255,200,0,0.06)">
          <AlertIcon />
          <AlertDescription fontSize="sm">
            WHERE fields [{whereFields.join(', ')}] don&apos;t match any declared index prefix.
            The query may be rejected by the platform.
            {indices.length > 0 && (
              <Text as="span" display="block" mt={1} fontSize="xs" color="gray.400">
                Available indices:{' '}
                {indices.map((idx) => `${idx.name} [${idx.properties.map((p) => p.field).join(', ')}]`).join(' · ')}
              </Text>
            )}
          </AlertDescription>
        </Alert>
      )}

      {!!contractQ.data && !docSchema && (
        <Alert status="error" borderRadius="md" bg="rgba(255,0,0,0.08)">
          <AlertIcon />
          <AlertDescription fontSize="sm">
            Document type &quot;{parsed.from}&quot; not found in this contract.
          </AlertDescription>
        </Alert>
      )}

      {previewParams && (
        <InfoBlock p={3}>
          <HStack
            as="button"
            spacing={2}
            onClick={() => setShowParams((s) => !s)}
            cursor="pointer"
            w="100%"
          >
            <Text fontSize="xs" color="gray.400" fontWeight={500}>
              SDK parameters
            </Text>
            <IconButton
              aria-label="toggle params"
              icon={showParams ? <ChevronUpIcon /> : <ChevronDownIcon />}
              size="xs"
              variant="ghost"
              color="gray.400"
            />
          </HStack>
          <Collapse in={showParams}>
            <Code
              display="block"
              fontSize="2xs"
              bg="gray.800"
              color="gray.300"
              p={3}
              mt={2}
              borderRadius="md"
              whiteSpace="pre-wrap"
              overflowX="auto"
            >
              {JSON.stringify(previewParams, null, 2)}
            </Code>
          </Collapse>
        </InfoBlock>
      )}

      {contractQ.isLoading && <LoadingCard />}

      {isAggregate && activeAggQ && (
        <AggregateResults
          kind={parsed.select as 'count' | 'sum' | 'avg'}
          aggregateField={parsed.aggregateField}
          groupBy={parsed.groupBy}
          groupBySchemas={groupBySchemas}
          data={activeAggQ.data as AggregateResultMap | undefined}
          isLoading={activeAggQ.isLoading}
          isError={activeAggQ.isError}
          error={
            activeAggQ.error instanceof Error
              ? activeAggQ.error
              : activeAggQ.error
              ? new Error(String(activeAggQ.error))
              : null
          }
          refetch={() => activeAggQ.refetch()}
        />
      )}

      {!isAggregate && queryParams && (
        paginationEnabled ? (
          <QueryResults
            data={docsQ.data}
            isLoading={docsQ.isLoading}
            isError={docsQ.isError}
            error={docsQ.error instanceof Error ? docsQ.error : docsQ.error ? new Error(String(docsQ.error)) : null}
            refetch={() => docsQ.refetch()}
            columns={columns}
            contractId={effectiveContractId!}
            documentType={parsed.from}
            limit={limit}
            cursorStack={cursorStack!}
            onCursorStackChange={onCursorStackChange!}
          />
        ) : (
          // Multi-statement: pagination doesn't make sense across N parallel
          // document queries, render a single page without prev/next.
          <QueryResults
            data={docsQ.data}
            isLoading={docsQ.isLoading}
            isError={docsQ.isError}
            error={docsQ.error instanceof Error ? docsQ.error : docsQ.error ? new Error(String(docsQ.error)) : null}
            refetch={() => docsQ.refetch()}
            columns={columns}
            contractId={effectiveContractId!}
            documentType={parsed.from}
            limit={limit}
            cursorStack={[undefined]}
            onCursorStackChange={() => { /* noop in multi mode */ }}
          />
        )
      )}

      {/* Light separator between statements when stacked. */}
      <Box />
    </VStack>
  );
}
