'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Alert,
  AlertDescription,
  AlertIcon,
  Code,
  Collapse,
  Heading,
  HStack,
  IconButton,
  Text,
  VStack,
} from '@chakra-ui/react';
import { ChevronDownIcon, ChevronUpIcon } from '@chakra-ui/icons';
import { Container } from '@ui/Container';
import { InfoBlock } from '@ui/InfoBlock';
import { LoadingCard } from '@ui/LoadingCard';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import { useContract, useDocumentsQuery } from '@sdk/queries';
import {
  parseSql,
  resolveContractId,
  toDocumentsQuery,
  type ParsedQuery,
  type ParseResult,
} from '@util/sql-parser';
import {
  getDocumentTypeSchema,
  getIndicesForType,
  heuristicColumnsForType,
  validateWhereAgainstIndices,
} from '@util/schema';
import { SYSTEM_DATA_CONTRACTS } from '@constants/system-data-contracts';
import { SqlEditor } from './SqlEditor';
import { ContractPicker } from './ContractPicker';
import { QueryPresets } from './QueryPresets';
import { QueryResults } from './QueryResults';

const DEFAULT_CONTRACT_ID = SYSTEM_DATA_CONTRACTS[0]!.testnetId; // DPNS

export function QueryPage() {
  const router = useRouter();
  const params = useSearchParams();

  usePageBreadcrumbs([{ label: 'Home', href: '/' }, { label: 'Query' }]);

  // ── URL-sourced initial state ──────────────────────────────────────
  const initialContract = params.get('contract') ?? DEFAULT_CONTRACT_ID;
  const initialSql = params.get('q') ?? '';

  // ── Local state ────────────────────────────────────────────────────
  const [pickerContractId, setPickerContractId] = useState(initialContract);
  const [sqlText, setSqlText] = useState(initialSql);
  const [submittedSql, setSubmittedSql] = useState<string | null>(initialSql || null);
  const [cursorStack, setCursorStack] = useState<Array<string | undefined>>([undefined]);
  const [showParams, setShowParams] = useState(false);

  // ── Parse the submitted SQL ────────────────────────────────────────
  const parseResult: ParseResult | null = useMemo(
    () => (submittedSql ? parseSql(submittedSql) : null),
    [submittedSql],
  );
  const parsed: ParsedQuery | null = parseResult?.ok ? parseResult.query : null;

  // ── Resolve contract ───────────────────────────────────────────────
  const { contractId: effectiveContractId, source: contractSource } = useMemo(() => {
    if (!parsed) return { contractId: pickerContractId, source: 'picker' as const };
    return resolveContractId(parsed, pickerContractId);
  }, [parsed, pickerContractId]);

  const aliasError = parsed?.contractAlias && !effectiveContractId
    ? `Unknown contract alias '${parsed.contractAlias}'. Available: ${SYSTEM_DATA_CONTRACTS.map((c) => c.key).join(', ')}`
    : null;

  // ── Fetch contract schema ──────────────────────────────────────────
  const contractQ = useContract(effectiveContractId || undefined);

  const docSchema = useMemo(
    () => (contractQ.data && parsed ? getDocumentTypeSchema(contractQ.data, parsed.from) : undefined),
    [contractQ.data, parsed],
  );
  const indices = useMemo(() => getIndicesForType(docSchema), [docSchema]);
  const columns = useMemo(() => heuristicColumnsForType(docSchema), [docSchema]);

  // ── Index validation (warning only) ────────────────────────────────
  const whereFields = useMemo(
    () => (parsed ? parsed.where.map((w) => w.field) : []),
    [parsed],
  );
  const validation = useMemo(
    () => validateWhereAgainstIndices(whereFields, indices),
    [whereFields, indices],
  );

  // ── Build SDK params ───────────────────────────────────────────────
  const startAfter = cursorStack[cursorStack.length - 1];
  const queryParams = useMemo(() => {
    if (!parsed || !effectiveContractId || aliasError) return undefined;
    if (parsed.select !== 'documents') return undefined;
    return toDocumentsQuery(parsed, effectiveContractId, { startAfter });
  }, [parsed, effectiveContractId, aliasError, startAfter]);

  const docsQ = useDocumentsQuery(queryParams);

  // ── Handlers ───────────────────────────────────────────────────────
  const handleRun = useCallback(() => {
    setSubmittedSql(sqlText);
    setCursorStack([undefined]);
    // sync URL
    const url = new URL(window.location.href);
    url.searchParams.set('q', sqlText);
    url.searchParams.set('contract', pickerContractId);
    router.replace(url.pathname + url.search, { scroll: false });
  }, [sqlText, pickerContractId, router]);

  const handlePreset = useCallback((sql: string, contractId: string) => {
    setSqlText(sql);
    setPickerContractId(contractId);
    setSubmittedSql(sql);
    setCursorStack([undefined]);
    const url = new URL(window.location.href);
    url.searchParams.set('q', sql);
    url.searchParams.set('contract', contractId);
    router.replace(url.pathname + url.search, { scroll: false });
  }, [router]);

  const handleContractChange = useCallback((id: string) => {
    setPickerContractId(id);
    setCursorStack([undefined]);
  }, []);

  // ── Render ─────────────────────────────────────────────────────────
  const parseError = parseResult && !parseResult.ok ? parseResult : null;
  const limit = parsed?.limit ?? 25;

  return (
    <Container py={{ base: 4, md: 6 }}>
      <VStack align="stretch" spacing={4}>
        {/* Header */}
        <InfoBlock emphasised>
          <VStack align="flex-start" spacing={1}>
            <Heading size="md" color="gray.100">
              SQL Query
            </Heading>
            <Text fontSize="sm" color="gray.250">
              Query documents on Dash Platform using SQL syntax. Select a contract
              or use <Code fontSize="xs">FROM alias.docType</Code> (e.g.{' '}
              <Code fontSize="xs">dpns.domain</Code>).
            </Text>
          </VStack>
        </InfoBlock>

        {/* Contract Picker */}
        <InfoBlock>
          <ContractPicker
            contractId={pickerContractId}
            onChange={handleContractChange}
            resolvedAlias={contractSource === 'alias' ? parsed?.contractAlias : undefined}
          />
        </InfoBlock>

        {/* SQL Editor + Presets */}
        <InfoBlock>
          <VStack align="stretch" spacing={3}>
            <SqlEditor
              value={sqlText}
              onChange={setSqlText}
              onRun={handleRun}
              parseError={parseError}
              isLoading={docsQ.isLoading}
            />
            <QueryPresets onSelect={handlePreset} />
          </VStack>
        </InfoBlock>

        {/* Alias error */}
        {aliasError && (
          <Alert status="error" borderRadius="md" bg="rgba(255,0,0,0.08)">
            <AlertIcon />
            <AlertDescription fontSize="sm">{aliasError}</AlertDescription>
          </Alert>
        )}

        {/* Index validation warning */}
        {parsed && whereFields.length > 0 && !validation.valid && !!contractQ.data && docSchema && (
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

        {/* Document type not found */}
        {parsed && !!contractQ.data && !docSchema && (
          <Alert status="error" borderRadius="md" bg="rgba(255,0,0,0.08)">
            <AlertIcon />
            <AlertDescription fontSize="sm">
              Document type &quot;{parsed.from}&quot; not found in this contract.
            </AlertDescription>
          </Alert>
        )}

        {/* SDK params preview */}
        {queryParams && (
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
                {JSON.stringify(queryParams, null, 2)}
              </Code>
            </Collapse>
          </InfoBlock>
        )}

        {/* COUNT result */}
        {parsed?.select === 'count' && submittedSql && (
          <InfoBlock>
            <Text fontSize="sm" color="gray.400">
              COUNT queries are not yet supported in the browser SDK. Use{' '}
              <Code fontSize="xs">SELECT *</Code> to fetch documents.
            </Text>
          </InfoBlock>
        )}

        {/* Loading contract */}
        {contractQ.isLoading && <LoadingCard />}

        {/* Document results */}
        {queryParams && parsed?.select === 'documents' && (
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
            cursorStack={cursorStack}
            onCursorStackChange={setCursorStack}
          />
        )}
      </VStack>
    </Container>
  );
}
