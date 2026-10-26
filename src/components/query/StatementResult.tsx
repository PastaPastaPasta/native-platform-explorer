'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
import {
  useContract,
  useDocumentsQuery,
  useDocumentsAggregate,
  type AggregateKind,
} from '@sdk/queries';
import { resolveContractId, toDocumentsQuery, type ParsedQuery } from '@util/sql-parser';
import { toError } from '@util/errors';
import { describeQueryError, documentPageCursor } from '@util/query-workspace';
import { useSdk } from '@sdk/hooks';
import { usePlatformProtocolVersion } from '@sdk/health';
import { ResultActions } from './ResultActions';
import {
  aggregateGroupBound,
  checkAggregateAgainstIndices,
  checkQueryAgainstIndices,
  RANGE_OPERATORS,
  getDocumentTypeAggregates,
  getDocumentTypeSchema,
  getIndicesForType,
  getPropertySchema,
  heuristicColumnsForType,
} from '@util/schema';
import { SYSTEM_DATA_CONTRACTS } from '@constants/system-data-contracts';
import { QueryResults } from './QueryResults';
import { AggregateResults, type AggregateResultMap } from './AggregateResults';

/** Protocol versions as of 2026-10-26, used until system.status answers. */
const KNOWN_PROTOCOL_VERSIONS: Partial<Record<string, number>> = { mainnet: 13, testnet: 14 };

/** The GROUP BY field that also carries the range filter (RangeDistinct mode). */
function rangeGroupField(parsed: ParsedQuery): string | undefined {
  const field = parsed.groupBy?.[parsed.groupBy.length - 1];
  return field && parsed.where.some((w) => w.field === field && RANGE_OPERATORS.has(w.operator)) ? field : undefined;
}

export interface StatementResultProps {
  parsed: ParsedQuery;
  /** Contract picked in the UI; only used when the statement doesn't carry
   *  its own `alias.docType` FROM clause. */
  pickerContractId: string | undefined;
  executionId: string;
  active: boolean;
  executionState: 'queued' | 'running' | 'done';
  onStateChange: (state: 'queued' | 'running' | 'done') => void;
}

export function StatementResult({
  parsed,
  pickerContractId,
  executionId,
  active,
  executionState,
  onStateChange,
}: StatementResultProps) {
  const [showParams, setShowParams] = useState(false);
  const [cursorStack, setCursorStack] = useState<Array<string | undefined>>([undefined]);
  const [result, setResult] = useState<{
    data: unknown;
    error: Error | null;
    retrievedAt: number;
  } | null>(null);
  const { network } = useSdk();
  const protocolVersion = usePlatformProtocolVersion() ?? KNOWN_PROTOCOL_VERSIONS[network];
  const stateChangeRef = useRef(onStateChange);
  stateChangeRef.current = onStateChange;

  const { contractId: effectiveContractId, source: contractSource } = useMemo(() => {
    return resolveContractId(parsed, pickerContractId);
  }, [parsed, pickerContractId]);

  const aliasError =
    parsed.contractAlias && !effectiveContractId
      ? `Unknown contract alias '${parsed.contractAlias}'. Available: ${SYSTEM_DATA_CONTRACTS.map((c) => c.key).join(', ')}`
      : !effectiveContractId
        ? 'Select a data contract or use FROM alias.documentType before running this statement.'
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

  const indexCheck = useMemo(() => {
    if (!docSchema) return undefined;
    return parsed.select === 'documents'
      ? checkQueryAgainstIndices(parsed, indices, { protocolVersion })
      : checkAggregateAgainstIndices(parsed, parsed.select, parsed.aggregateField, indices, getDocumentTypeAggregates(docSchema));
  }, [parsed, indices, docSchema, protocolVersion]);

  const startAfter = cursorStack[cursorStack.length - 1];

  const params = useMemo(() => {
    if (!effectiveContractId || aliasError) return undefined;
    return toDocumentsQuery(
      parsed,
      effectiveContractId,
      parsed.select === 'documents' ? { startAfter } : undefined,
    );
  }, [parsed, effectiveContractId, aliasError, startAfter]);

  const aggregateKind: AggregateKind | undefined =
    parsed.select === 'documents' ? undefined : parsed.select;
  const isAggregate = aggregateKind !== undefined;

  const docsQ = useDocumentsQuery(active && !isAggregate ? params : undefined, executionId);
  const aggQ = useDocumentsAggregate(
    active && isAggregate ? params : undefined,
    aggregateKind,
    parsed.aggregateField,
    executionId,
  );

  const limit = parsed.limit ?? 25;
  // A full page only means more documents may exist; ask for the next one.
  const page = useMemo(() => documentPageCursor(result?.data), [result]);
  const probeParams =
    !isAggregate && params && result && !result.error && page.count >= limit && page.lastId
      ? { ...params, limit: 1, startAfter: page.lastId }
      : undefined;
  const probeQ = useDocumentsQuery(probeParams, `${executionId}-next-${page.lastId ?? ''}`);
  // If the follow-up fails, fall back to offering Next for a full page.
  const hasNextPage = !!probeParams && (probeQ.isError || (probeQ.isSuccess && documentPageCursor(probeQ.data).count > 0));

  const refetch = isAggregate ? aggQ.refetch : docsQ.refetch;
  useEffect(() => {
    if (!active) return;
    if (!params || aliasError) {
      stateChangeRef.current('done');
      return;
    }
    let cancelled = false;
    stateChangeRef.current('running');
    // Deduplicate with the hook's initial fetch, but always refetch cached
    // results for an explicit Run. Later responses from removed runs are ignored.
    void refetch({ cancelRefetch: false })
      .then((response) => {
        if (cancelled) return;
        setResult({ data: response.data, error: toError(response.error), retrievedAt: Date.now() });
        stateChangeRef.current('done');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setResult({ data: undefined, error: toError(error), retrievedAt: Date.now() });
        stateChangeRef.current('done');
      });
    return () => {
      cancelled = true;
    };
  }, [active, params, aliasError, refetch]);

  function changePage(stack: Array<string | undefined>) {
    setResult(null);
    setCursorStack(stack);
    stateChangeRef.current('queued');
  }

  function retry() {
    setResult(null);
    stateChangeRef.current('queued');
  }

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
              : `${parsed.select.toUpperCase()}(${parsed.aggregateField ?? '?'})`}
          {' FROM '}
          {resolvedAlias ? `${resolvedAlias}.` : ''}
          {parsed.from}
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

      {!!indexCheck?.warnings.length && (
        <Alert status="warning" borderRadius="md" bg="rgba(255,200,0,0.06)" alignItems="flex-start">
          <AlertIcon />
          <AlertDescription fontSize="sm">
            The Platform will probably reject this query:
            <Box as="ul" pl={4} mt={1}>
              {indexCheck.warnings.map((warning) => (
                <Text as="li" key={warning} fontSize="xs" color="gray.300">
                  {warning}
                </Text>
              ))}
            </Box>
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

      {params && (
        <InfoBlock p={3}>
          <HStack
            role="button"
            tabIndex={0}
            aria-expanded={showParams}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setShowParams((shown) => !shown);
              }
            }}
            spacing={2}
            onClick={() => setShowParams((s) => !s)}
            cursor="pointer"
            w="100%"
          >
            <Text fontSize="xs" color="gray.400" fontWeight={500}>
              SDK parameters
            </Text>
            <IconButton
              as="span"
              aria-hidden="true"
              tabIndex={-1}
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
              {JSON.stringify(params, null, 2)}
            </Code>
          </Collapse>
        </InfoBlock>
      )}

      {executionState === 'queued' && !active && (
        <Text fontSize="xs" color="gray.400">
          Queued
        </Text>
      )}
      {result && !result.error && params && (
        <ResultActions
          parsed={parsed}
          params={params}
          data={result.data}
          retrievedAt={result.retrievedAt}
        />
      )}
      {result?.error && (
        <Text fontSize="xs" color="orange.300">
          {describeQueryError(result.error.message) ??
            "Check this network's contract and document type, then compare WHERE and ORDER BY with the declared index order. Unsupported SQL is rejected in the editor; Platform errors may also reflect index requirements or an unavailable endpoint."}
        </Text>
      )}
      {result && (
        <Text fontSize="2xs" color="gray.500">
          Retrieved on {network} at {new Date(result.retrievedAt).toLocaleString()}.
        </Text>
      )}

      {isAggregate && (
        <AggregateResults
          kind={parsed.select as 'count' | 'sum' | 'avg'}
          aggregateField={parsed.aggregateField}
          groupBy={parsed.groupBy}
          groupBound={aggregateGroupBound(parsed)}
          rangeGroupField={rangeGroupField(parsed)}
          descending={parsed.orderBy[0]?.direction === 'desc'}
          groupBySchemas={groupBySchemas}
          data={result?.data as AggregateResultMap | undefined}
          isLoading={active || executionState === 'queued'}
          isError={!!result?.error}
          error={result?.error}
          refetch={retry}
        />
      )}

      {!isAggregate && params && (
        <QueryResults
          data={result?.data}
          isLoading={active || executionState === 'queued'}
          isError={!!result?.error}
          error={result?.error}
          refetch={retry}
          columns={columns}
          contractId={effectiveContractId!}
          documentType={parsed.from}
          hasNext={hasNextPage}
          checkingNext={!!probeParams && probeQ.isFetching}
          lastId={page.lastId}
          cursorStack={cursorStack}
          onCursorStackChange={changePage}
        />
      )}

      {/* Light separator between statements when stacked. */}
      <Box />
    </VStack>
  );
}
