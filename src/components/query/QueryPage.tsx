'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Code, Heading, HStack, Text, VStack, useToast } from '@chakra-ui/react';
import type { EvoSDK } from '@dashevo/evo-sdk';
import { Container } from '@ui/Container';
import { InfoBlock } from '@ui/InfoBlock';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import { useSdk } from '@sdk/hooks';
import { parseSqlMulti, type ParsedQuery } from '@util/sql-parser';
import { SYSTEM_DATA_CONTRACTS } from '@constants/system-data-contracts';
import { SqlEditor } from './SqlEditor';
import { ContractPicker } from './ContractPicker';
import { QueryPresets } from './QueryPresets';
import { StatementResult } from './StatementResult';
import { SchemaAssistant } from './SchemaAssistant';
import { SavedQueries } from './SavedQueries';

const DEFAULT_CONTRACT_ID = SYSTEM_DATA_CONTRACTS[0]!.testnetId;
const MAX_CONCURRENT_STATEMENTS = 2;
type StatementState = 'queued' | 'running' | 'done';
interface QueryRun {
  id: string;
  sql: string;
  contractId: string;
  network: string;
  trusted: boolean;
  sdk: EvoSDK;
  queries: ParsedQuery[];
  states: StatementState[];
}

export function QueryPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { sdk, status, network, trusted } = useSdk();
  const toast = useToast();
  usePageBreadcrumbs([{ label: 'Home', href: '/' }, { label: 'Query' }]);

  const [pickerContractId, setPickerContractId] = useState(
    params.get('contract') ?? DEFAULT_CONTRACT_ID,
  );
  const [sqlText, setSqlText] = useState(params.get('q') ?? '');
  const [run, setRun] = useState<QueryRun | null>(null);
  const [parseError, setParseError] = useState<{ message: string; position: number } | null>(null);
  const [notice, setNotice] = useState('');
  const initialQueryPending = useRef(!!params.get('q'));

  const queryPath = useCallback(
    (sql: string, contractId: string) => {
      const qp = new URLSearchParams({ q: sql, contract: contractId, network });
      return `/query/?${qp.toString()}`;
    },
    [network],
  );

  const startRun = useCallback(
    (sql: string, contractId: string) => {
      initialQueryPending.current = false;
      const parsed = parseSqlMulti(sql);
      setParseError(parsed.ok ? null : parsed);
      setRun(null);
      if (!parsed.ok) return;
      if (status !== 'ready' || !sdk) {
        setNotice('Connect to the network before running a query.');
        return;
      }
      setNotice('');
      setRun({
        id: crypto.randomUUID(),
        sql,
        contractId,
        network,
        trusted,
        sdk,
        queries: parsed.queries,
        states: parsed.queries.map(() => 'queued'),
      });
      router.replace(queryPath(sql, contractId), { scroll: false });
    },
    [sdk, status, network, trusted, router, queryPath],
  );

  // Shared queries run only after the selected SDK session is ready.
  useEffect(() => {
    if (initialQueryPending.current && status === 'ready' && sdk)
      startRun(sqlText, pickerContractId);
  }, [status, sdk, sqlText, pickerContractId, startRun]);

  // Check context in render as well as clearing state: old results are never
  // visible for one frame after an editor, network, or SDK session change.
  const currentRun =
    run &&
    run.sql === sqlText &&
    run.contractId === pickerContractId &&
    run.network === network &&
    run.trusted === trusted &&
    run.sdk === sdk
      ? run
      : null;
  useEffect(() => {
    if (run && !currentRun) {
      setRun(null);
      setNotice('Query context changed. Run again to fetch current results.');
    }
  }, [run, currentRun]);

  const activeStatements = useMemo(() => {
    if (!currentRun) return new Set<number>();
    const running = currentRun.states.flatMap((state, i) => (state === 'running' ? [i] : []));
    const queued = currentRun.states.flatMap((state, i) => (state === 'queued' ? [i] : []));
    return new Set([...running, ...queued.slice(0, MAX_CONCURRENT_STATEMENTS - running.length)]);
  }, [currentRun]);
  const isRunning = !!currentRun?.states.some((state) => state !== 'done');

  const updateStatement = useCallback((runId: string, index: number, state: StatementState) => {
    setRun((previous) => {
      if (!previous || previous.id !== runId || previous.states[index] === state) return previous;
      const states = [...previous.states];
      states[index] = state;
      return { ...previous, states };
    });
  }, []);

  const editSql = useCallback((sql: string) => {
    initialQueryPending.current = false;
    setSqlText(sql);
    setParseError(null);
  }, []);

  return (
    <Container py={{ base: 4, md: 6 }}>
      <VStack align="stretch" spacing={4}>
        <InfoBlock emphasised>
          <VStack align="flex-start" spacing={1}>
            <Heading size="md" color="gray.100">
              Query workspace
            </Heading>
            <Text fontSize="sm" color="gray.250">
              Query Dash Platform documents with <Code fontSize="xs">SELECT *</Code>, COUNT, SUM, or
              AVG. Use <Code fontSize="xs">FROM alias.docType</Code> or select a contract below.
              Separate statements with <Code fontSize="xs">;</Code>; up to two run at a time.
            </Text>
          </VStack>
        </InfoBlock>
        <InfoBlock>
          <VStack align="stretch" spacing={3}>
            <ContractPicker
              contractId={pickerContractId}
              onChange={(id) => {
                initialQueryPending.current = false;
                setPickerContractId(id);
              }}
            />
            <SchemaAssistant contractId={pickerContractId} sql={sqlText} onChange={editSql} />
          </VStack>
        </InfoBlock>
        <InfoBlock>
          <VStack align="stretch" spacing={3}>
            <SqlEditor
              value={sqlText}
              onChange={editSql}
              onRun={() => startRun(sqlText, pickerContractId)}
              parseError={parseError}
              isLoading={isRunning}
              isDisabled={status !== 'ready'}
              onCancel={() => {
                setRun(null);
                setNotice(
                  'Cancelled. Queued statements were stopped and late responses discarded. Running SDK requests may finish in the background.',
                );
              }}
            />
            <HStack spacing={3} flexWrap="wrap">
              <Text fontSize="xs" color="gray.400" role="status" aria-live="polite">
                {isRunning
                  ? `${currentRun!.states.filter((state) => state === 'done').length} of ${currentRun!.queries.length} statements complete on ${network}`
                  : currentRun
                    ? `Run complete on ${network}`
                    : notice || (status === 'ready' ? `Ready on ${network}` : `SDK ${status}`)}
              </Text>
              <Button
                size="xs"
                variant="outline"
                isDisabled={!sqlText.trim()}
                onClick={async () => {
                  try {
                    const url = new URL(window.location.href);
                    // Preserve a configured hosting base path from the current route.
                    url.search = queryPath(sqlText, pickerContractId).split('?')[1]!;
                    url.hash = '';
                    await navigator.clipboard.writeText(url.toString());
                    toast({ status: 'success', title: 'Query link copied' });
                  } catch {
                    toast({
                      status: 'error',
                      title: 'Could not copy link. Run the query and copy its address instead.',
                    });
                  }
                }}
              >
                Copy query link
              </Button>
            </HStack>
            <Text fontSize="xs" color="gray.400">
              SQL is translated to SDK queries. JOIN, OR, OFFSET, DISTINCT, and field projections
              are unavailable. Filters and sorting must follow a declared index. SUM and AVG require
              an integer property. Running or sharing a query puts its SQL in the address bar; links
              include your filter values.
            </Text>
            <QueryPresets
              onSelect={(sql, contractId) => {
                setSqlText(sql);
                setPickerContractId(contractId);
                startRun(sql, contractId);
              }}
            />
            <SavedQueries
              network={network}
              contractId={pickerContractId}
              sql={sqlText}
              onLoad={editSql}
            />
          </VStack>
        </InfoBlock>
        {currentRun?.queries.map((parsed, i) => (
          <StatementResult
            key={`${currentRun.id}-${i}`}
            executionId={`${currentRun.id}-${i}`}
            parsed={parsed}
            pickerContractId={currentRun.contractId}
            active={activeStatements.has(i)}
            executionState={currentRun.states[i]!}
            onStateChange={(state) => updateStatement(currentRun.id, i, state)}
          />
        ))}
      </VStack>
    </Container>
  );
}
