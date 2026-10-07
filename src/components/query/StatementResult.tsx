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
import { useSdk } from '@sdk/hooks';
import { ResultActions } from './ResultActions';
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

  const whereFields = parsed.where.map((w) => w.field);
  const validation = useMemo(
    () => validateWhereAgainstIndices(whereFields, indices),
    [whereFields, indices],
  );

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

  const limit = parsed.limit ?? 25;
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

      {whereFields.length > 0 && !validation.valid && !!contractQ.data && docSchema && (
        <Alert status="warning" borderRadius="md" bg="rgba(255,200,0,0.06)">
          <AlertIcon />
          <AlertDescription fontSize="sm">
            WHERE fields [{whereFields.join(', ')}] don&apos;t match any declared index prefix. The
            query may be rejected by the platform.
            {indices.length > 0 && (
              <Text as="span" display="block" mt={1} fontSize="xs" color="gray.400">
                Available indices:{' '}
                {indices
                  .map((idx) => `${idx.name} [${idx.properties.map((p) => p.field).join(', ')}]`)
                  .join(' · ')}
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
          Check this network&apos;s contract and document type, then compare WHERE and ORDER BY with
          the declared index order. Unsupported SQL is rejected in the editor; Platform errors may
          also reflect index requirements or an unavailable endpoint.
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
          limit={limit}
          cursorStack={cursorStack}
          onCursorStackChange={changePage}
        />
      )}

      {/* Light separator between statements when stacked. */}
      <Box />
    </VStack>
  );
}
