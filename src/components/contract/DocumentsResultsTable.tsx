'use client';

import NextLink from 'next/link';
import {
  Box,
  Button,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
} from '@chakra-ui/react';
import { Identifier } from '@components/data/Identifier';
import { IdentityLink } from '@components/data/IdentityLink';
import { NotActive } from '@components/data/NotActive';
import type { HeuristicColumn } from '@util/schema';
import { idToString, readDocumentField } from '@util/sdk-shape';

export interface DocumentsResultsTableProps {
  columns: HeuristicColumn[];
  rows: Array<Record<string, unknown>>;
  contractId: string;
  documentType: string;
}

function renderCell(row: Record<string, unknown>, col: HeuristicColumn) {
  const value = readDocumentField<unknown>(row, col.key);

  if (value === null || value === undefined) return <NotActive />;

  if (col.kind === 'identifier') {
    // Identifier fields may arrive as base58 strings, Identifier class
    // instances (toBase58), or raw Uint8Array bytes — normalise all three.
    const s = idToString(value) ?? String(value);
    if (col.key === '$ownerId') return <IdentityLink id={s} dense />;
    return <Identifier value={s} dense avatar={false} />;
  }

  if (col.kind === 'json') {
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
        {JSON.stringify(value)}
      </Text>
    );
  }

  return (
    <Text as="span" fontFamily="mono" fontSize="xs" color="gray.100">
      {String(value)}
    </Text>
  );
}

function getDocId(row: Record<string, unknown>, fallbackIndex: number): string {
  const id = readDocumentField<unknown>(row, '$id');
  const asString = idToString(id);
  if (asString !== undefined) return asString;
  if (id !== undefined && id !== null) return String(id);
  return String(fallbackIndex);
}

export function DocumentsResultsTable({
  columns,
  rows,
  contractId,
  documentType,
}: DocumentsResultsTableProps) {
  if (rows.length === 0) {
    return (
      <Text color="gray.400" fontSize="sm">
        No documents match these filters.
      </Text>
    );
  }

  return (
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
            const docId = getDocId(row, i);
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
                    href={`/contract/document/?id=${encodeURIComponent(contractId)}&type=${encodeURIComponent(documentType)}&docId=${encodeURIComponent(docId)}`}
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
  );
}

export function getLastDocId(rows: Array<Record<string, unknown>>): string | undefined {
  const last = rows[rows.length - 1];
  if (!last) return undefined;
  const id = readDocumentField<unknown>(last, '$id');
  if (id === undefined || id === null) return undefined;
  return idToString(id) ?? String(id);
}
