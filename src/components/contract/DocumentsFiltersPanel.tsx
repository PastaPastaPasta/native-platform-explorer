'use client';

import { useState } from 'react';
import {
  Box,
  Button,
  Grid,
  HStack,
  Heading,
  IconButton,
  Input,
  Select,
  Text,
  VStack,
  Wrap,
  WrapItem,
} from '@chakra-ui/react';
import { CloseIcon } from '@chakra-ui/icons';
import { PageSizeSelector, type PageSize } from '@components/pagination/PageSizeSelector';
import { InfoBlock } from '@ui/InfoBlock';
import type { SchemaIndex } from '@util/schema';
import {
  fieldKind,
  indexedFields,
  operatorsFor,
  type DocumentFilter,
  type FilterOperator,
  type OrderBy,
} from '@util/document-filters';

type Schema = Record<string, unknown> | undefined;

const OPERATOR_LABELS: Record<FilterOperator, string> = {
  '==': '=',
  '<': '<',
  '<=': '≤',
  '>': '>',
  '>=': '≥',
  in: 'in (comma list)',
  startsWith: 'starts with',
};

export interface DocumentsFiltersPanelProps {
  docSchema: Schema;
  indices: SchemaIndex[];
  /** Applied filters (from the URL). Edits stay local until applied. */
  filters: DocumentFilter[];
  orderBy: OrderBy | null;
  /** The ORDER BY actually sent, when derived from a range/IN filter. */
  derivedOrderBy?: OrderBy | null;
  errors: string[];
  warnings: string[];
  limit: PageSize;
  onApply: (filters: DocumentFilter[], orderBy: OrderBy | null) => void;
  onLimitChange: (n: PageSize) => void;
  onReset: () => void;
}

export function DocumentsFiltersPanel({
  docSchema,
  indices,
  filters,
  orderBy,
  derivedOrderBy,
  errors,
  warnings,
  limit,
  onApply,
  onLimitChange,
  onReset,
}: DocumentsFiltersPanelProps) {
  const fields = indexedFields(indices);
  // Drafts start from the applied state; the parent re-keys the panel when
  // the applied state changes (URL navigation, reset).
  const [draft, setDraft] = useState<DocumentFilter[]>(filters);
  const [draftOrder, setDraftOrder] = useState<OrderBy | null>(orderBy);

  const update = (i: number, next: Partial<{ field: string; op: FilterOperator; value: string }>) =>
    setDraft((rows) => rows.map((row, j) => {
      if (j !== i) return row;
      const field = next.field ?? row[0];
      const ops = operatorsFor(fieldKind(docSchema, field));
      const op = next.op ?? (ops.includes(row[1]) ? row[1] : ops[0]!);
      const value = next.value ?? (next.field && fieldKind(docSchema, field) === 'boolean' ? 'true' : row[2]);
      return [field, op, value];
    }));

  const addRow = () => {
    const field = fields[0];
    if (!field) return;
    const kind = fieldKind(docSchema, field);
    setDraft((rows) => [...rows, [field, '==', kind === 'boolean' ? 'true' : '']]);
  };

  const dirty = JSON.stringify(draft) !== JSON.stringify(filters) || JSON.stringify(draftOrder) !== JSON.stringify(orderBy);

  return (
    <InfoBlock>
      <Heading size="sm" color="gray.100" mb={2}>
        Filters
      </Heading>
      <Text fontSize="xs" color="gray.400" mb={3}>
        Queries must follow a declared index, with at most one range field, and range or IN
        fields must be ordered. Index warnings are advisory; Platform decides. Indices:{' '}
        {indices.map((i) => `${i.name} (${i.properties.map((p) => p.field).join(', ')})`).join('; ') || 'none'}.
      </Text>
      {indices.length === 0 ? (
        <Text fontSize="sm" color="gray.400">
          This document type declares no indices, so documents can only be listed in $id order.
        </Text>
      ) : (
        <VStack align="stretch" spacing={2}>
          {draft.map(([field, op, value], i) => {
            const kind = fieldKind(docSchema, field);
            return (
              <Grid key={i} templateColumns={{ base: '1fr', md: '2fr 1.2fr 3fr auto' }} gap={2} alignItems="center">
                <Select size="sm" aria-label={`Filter ${i + 1} field`} value={field} onChange={(e) => update(i, { field: e.target.value })} bg="gray.800" borderColor="gray.700">
                  {fields.map((f) => <option key={f} value={f}>{f}</option>)}
                </Select>
                <Select size="sm" aria-label={`Filter ${i + 1} operator`} value={op} onChange={(e) => update(i, { op: e.target.value as FilterOperator })} bg="gray.800" borderColor="gray.700">
                  {operatorsFor(kind).map((o) => <option key={o} value={o}>{OPERATOR_LABELS[o]}</option>)}
                </Select>
                {kind === 'boolean' ? (
                  <Select size="sm" aria-label={`Filter ${i + 1} value`} value={value} onChange={(e) => update(i, { value: e.target.value })} bg="gray.800" borderColor="gray.700">
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </Select>
                ) : (
                  <Input
                    size="sm"
                    aria-label={`Filter ${i + 1} value`}
                    placeholder={op === 'in' ? 'a, b, c' : kind === 'integer' || kind === 'number' ? 'number' : kind === 'identifier' ? 'base58 identifier' : 'value'}
                    value={value}
                    onChange={(e) => update(i, { value: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter') onApply(draft, draftOrder); }}
                    fontFamily="mono"
                    bg="gray.800"
                    borderColor="gray.700"
                  />
                )}
                <IconButton size="sm" variant="ghost" aria-label={`Remove filter ${i + 1}`} icon={<CloseIcon boxSize={2.5} />} onClick={() => setDraft((rows) => rows.filter((_, j) => j !== i))} />
              </Grid>
            );
          })}
          <HStack spacing={3} flexWrap="wrap">
            <Button size="xs" variant="outline" onClick={addRow}>+ Add filter</Button>
            <HStack spacing={2}>
              <Text fontSize="xs" color="gray.400">Order by</Text>
              <Select
                size="xs"
                aria-label="Order by field"
                value={draftOrder?.[0] ?? ''}
                onChange={(e) => setDraftOrder(e.target.value ? [e.target.value, draftOrder?.[1] ?? 'asc'] : null)}
                bg="gray.800"
                borderColor="gray.700"
                w="auto"
              >
                <option value="">{derivedOrderBy ? `auto (${derivedOrderBy[0]})` : 'default ($id)'}</option>
                {fields.map((f) => <option key={f} value={f}>{f}</option>)}
              </Select>
              <Select
                size="xs"
                aria-label="Order direction"
                value={draftOrder?.[1] ?? 'asc'}
                isDisabled={!draftOrder}
                onChange={(e) => draftOrder && setDraftOrder([draftOrder[0], e.target.value as 'asc' | 'desc'])}
                bg="gray.800"
                borderColor="gray.700"
                w="auto"
              >
                <option value="asc">ascending</option>
                <option value="desc">descending</option>
              </Select>
            </HStack>
          </HStack>
        </VStack>
      )}
      {errors.length > 0 || warnings.length > 0 ? (
        <Box mt={3} role="status">
          {errors.map((e) => <Text key={e} fontSize="sm" color="warning">{e}</Text>)}
          {warnings.map((w) => <Text key={w} fontSize="sm" color="warning">{w}</Text>)}
          {warnings.length > 0 && indices.length > 0 ? (
            <Wrap spacing={2} mt={2}>
              {indices.map((idx) => (
                <WrapItem key={idx.name}>
                  <Box px={2} py={1} bg="gray.800" border="1px solid" borderColor="gray.750" borderRadius="md" fontFamily="mono" fontSize="xs">
                    {idx.name}: {idx.properties.map((p) => p.field).join(', ')}
                  </Box>
                </WrapItem>
              ))}
            </Wrap>
          ) : null}
        </Box>
      ) : null}
      <HStack justify="flex-end" spacing={3} mt={3}>
        <Button size="sm" variant="ghost" onClick={onReset}>Reset</Button>
        <Button size="sm" colorScheme="blue" isDisabled={!dirty} onClick={() => onApply(draft, draftOrder)}>Apply</Button>
        <PageSizeSelector value={limit} onChange={onLimitChange} />
      </HStack>
    </InfoBlock>
  );
}
