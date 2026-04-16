'use client';

import {
  Box,
  Button,
  Grid,
  HStack,
  Heading,
  Text,
  Wrap,
  WrapItem,
} from '@chakra-ui/react';
import { ActiveFilters } from '@components/filters/ActiveFilters';
import { InputFilter } from '@components/filters/InputFilter';
import {
  PageSizeSelector,
  type PageSize,
} from '@components/pagination/PageSizeSelector';
import { InfoBlock } from '@ui/InfoBlock';
import type { SchemaIndex } from '@util/schema';

export interface DocumentsFiltersPanelProps {
  indices: SchemaIndex[];
  filters: Record<string, string>;
  onFiltersChange: (next: Record<string, string>) => void;
  activeFields: string[];
  validation: { valid: boolean; suggestions: SchemaIndex[] };
  limit: PageSize;
  onLimitChange: (n: PageSize) => void;
  onReset: () => void;
}

export function DocumentsFiltersPanel({
  indices,
  filters,
  onFiltersChange,
  activeFields,
  validation,
  limit,
  onLimitChange,
  onReset,
}: DocumentsFiltersPanelProps) {
  const fields = Array.from(
    new Set(indices.flatMap((idx) => idx.properties.map((p) => p.field))),
  );

  return (
    <InfoBlock>
      <Heading size="sm" color="gray.100" mb={3}>
        Filters
      </Heading>
      <Text fontSize="xs" color="gray.400" mb={3}>
        Queries must match a declared index. Available indices:{' '}
        {indices.map((i) => i.name).join(', ') || 'none'}.
      </Text>
      {indices.length === 0 ? (
        <Text fontSize="sm" color="gray.400">
          This document type declares no indices — browsing is not supported by the SDK.
        </Text>
      ) : (
        <Grid templateColumns={{ base: '1fr', md: 'repeat(3, 1fr)' }} gap={3}>
          {fields.map((field) => (
            <InputFilter
              key={field}
              label={field}
              value={filters[field] ?? ''}
              onChange={(v) => onFiltersChange({ ...filters, [field]: v })}
            />
          ))}
        </Grid>
      )}
      <Box mt={3}>
        <ActiveFilters
          filters={activeFields.map((f) => ({
            key: f,
            label: `${f} == ${filters[f]}`,
            onRemove: () => onFiltersChange({ ...filters, [f]: '' }),
          }))}
        />
      </Box>
      {!validation.valid ? (
        <InfoBlock>
          <Text fontSize="sm" color="warning">
            Your current filters don&apos;t match any index on this document type.
          </Text>
          <Text fontSize="xs" color="gray.400" mt={2}>
            Try one of the following combinations:
          </Text>
          <Wrap spacing={2} mt={1}>
            {validation.suggestions.map((idx) => (
              <WrapItem key={idx.name}>
                <Box
                  px={2}
                  py={1}
                  bg="gray.800"
                  border="1px solid"
                  borderColor="gray.750"
                  borderRadius="md"
                  fontFamily="mono"
                  fontSize="xs"
                >
                  {idx.name}: {idx.properties.map((p) => p.field).join(', ')}
                </Box>
              </WrapItem>
            ))}
          </Wrap>
        </InfoBlock>
      ) : null}
      <HStack justify="flex-end" spacing={3} mt={3}>
        <Button size="sm" variant="ghost" onClick={onReset}>
          Reset
        </Button>
        <PageSizeSelector value={limit} onChange={onLimitChange} />
      </HStack>
    </InfoBlock>
  );
}
