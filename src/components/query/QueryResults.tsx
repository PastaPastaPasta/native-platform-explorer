'use client';

import { useMemo } from 'react';
import { HStack, Text } from '@chakra-ui/react';
import { InfoBlock } from '@ui/InfoBlock';
import { LoadingCard } from '@ui/LoadingCard';
import { ErrorCard } from '@ui/ErrorCard';
import { DocumentsResultsTable, getLastDocId } from '@components/contract/DocumentsResultsTable';
import { CursorPagination } from '@components/pagination/CursorPagination';
import type { HeuristicColumn } from '@util/schema';
import { extractDocumentRows } from '@util/query-workspace';

export interface QueryResultsProps {
  data: unknown;
  isLoading: boolean;
  isError: boolean;
  error: Error | null | undefined;
  refetch: () => void;
  columns: HeuristicColumn[];
  contractId: string;
  documentType: string;
  limit: number;
  cursorStack: Array<string | undefined>;
  onCursorStackChange: (stack: Array<string | undefined>) => void;
}

export function QueryResults({
  data,
  isLoading,
  isError,
  error,
  refetch,
  columns,
  contractId,
  documentType,
  limit,
  cursorStack,
  onCursorStackChange,
}: QueryResultsProps) {
  const rows = useMemo(() => extractDocumentRows(data), [data]);

  return (
    <InfoBlock>
      {isLoading ? (
        <LoadingCard lines={6} />
      ) : isError ? (
        <ErrorCard error={error} onRetry={refetch} />
      ) : (
        <>
          <DocumentsResultsTable
            columns={columns}
            rows={rows}
            contractId={contractId}
            documentType={documentType}
          />
          <HStack justify="space-between" mt={3}>
            <Text fontSize="xs" color="gray.400">
              {rows.length} document{rows.length === 1 ? '' : 's'} returned
            </Text>
            <CursorPagination
              pageIndex={cursorStack.length - 1}
              hasPrev={cursorStack.length > 1}
              hasNext={rows.length === limit && !!getLastDocId(rows)}
              onPrev={() => onCursorStackChange(cursorStack.slice(0, -1))}
              onNext={() => {
                const lastId = getLastDocId(rows);
                if (lastId) onCursorStackChange([...cursorStack, lastId]);
              }}
            />
          </HStack>
        </>
      )}
    </InfoBlock>
  );
}
