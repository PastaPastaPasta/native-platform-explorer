'use client';

import { HStack, Tag, TagCloseButton, TagLabel } from '@chakra-ui/react';

export interface ActiveFilter {
  key: string;
  label: string;
  onRemove: () => void;
}

export function ActiveFilters({ filters }: { filters: ActiveFilter[] }) {
  if (filters.length === 0) return null;
  return (
    <HStack spacing={2} flexWrap="wrap">
      {filters.map((f) => (
        <Tag key={f.key} size="sm" colorScheme="blue" borderRadius="full">
          <TagLabel>{f.label}</TagLabel>
          <TagCloseButton onClick={f.onRemove} />
        </Tag>
      ))}
    </HStack>
  );
}
