'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Code,
  Heading,
  Text,
  VStack,
} from '@chakra-ui/react';
import { Container } from '@ui/Container';
import { InfoBlock } from '@ui/InfoBlock';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import {
  parseSqlMulti,
  type MultiParseResult,
  type ParsedQuery,
} from '@util/sql-parser';
import { SYSTEM_DATA_CONTRACTS } from '@constants/system-data-contracts';
import { SqlEditor } from './SqlEditor';
import { ContractPicker } from './ContractPicker';
import { QueryPresets } from './QueryPresets';
import { StatementResult } from './StatementResult';

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
  // Cursor pagination is per-statement state and only enables in the
  // single-statement case. Multi-statement runs render each result page-1.
  const [cursorStack, setCursorStack] = useState<Array<string | undefined>>([undefined]);

  // ── Parse the submitted SQL (one or more `;`-separated statements) ──
  const parseResult: MultiParseResult | null = useMemo(
    () => (submittedSql ? parseSqlMulti(submittedSql) : null),
    [submittedSql],
  );
  const queries: ParsedQuery[] = parseResult?.ok ? parseResult.queries : [];
  const parseError = parseResult && !parseResult.ok ? parseResult : null;

  // ── Handlers ───────────────────────────────────────────────────────
  const handleRun = useCallback(() => {
    setSubmittedSql(sqlText);
    setCursorStack([undefined]);
    const qp = new URLSearchParams();
    qp.set('q', sqlText);
    qp.set('contract', pickerContractId);
    router.replace(`/query/?${qp.toString()}`, { scroll: false });
  }, [sqlText, pickerContractId, router]);

  const handlePreset = useCallback((sql: string, contractId: string) => {
    setSqlText(sql);
    setPickerContractId(contractId);
    setSubmittedSql(sql);
    setCursorStack([undefined]);
    const qp = new URLSearchParams();
    qp.set('q', sql);
    qp.set('contract', contractId);
    router.replace(`/query/?${qp.toString()}`, { scroll: false });
  }, [router]);

  const handleContractChange = useCallback((id: string) => {
    setPickerContractId(id);
    setCursorStack([undefined]);
  }, []);

  const singleStatement = queries.length === 1;

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
              <Code fontSize="xs">dpns.domain</Code>). Multiple statements can be
              separated with <Code fontSize="xs">;</Code> and run in parallel.
            </Text>
          </VStack>
        </InfoBlock>

        {/* Contract Picker */}
        <InfoBlock>
          <ContractPicker
            contractId={pickerContractId}
            onChange={handleContractChange}
            resolvedAlias={undefined}
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
              isLoading={false}
            />
            <QueryPresets onSelect={handlePreset} />
          </VStack>
        </InfoBlock>

        {/* Statement results — one panel per parsed query. */}
        {queries.map((parsed, i) => (
          <StatementResult
            key={`stmt-${i}`}
            parsed={parsed}
            pickerContractId={pickerContractId}
            cursorStack={singleStatement ? cursorStack : undefined}
            onCursorStackChange={singleStatement ? setCursorStack : undefined}
          />
        ))}
      </VStack>
    </Container>
  );
}
