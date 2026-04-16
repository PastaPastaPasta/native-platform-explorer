'use client';

import { Button, HStack, Text } from '@chakra-ui/react';
import { ChevronLeftIcon, ChevronRightIcon } from '@chakra-ui/icons';

export interface PaginationProps {
  pageIndex: number; // zero-based
  pageCount: number;
  onChange: (next: number) => void;
}

export function Pagination({ pageIndex, pageCount, onChange }: PaginationProps) {
  if (pageCount <= 1) return null;
  return (
    <HStack spacing={2} justify="flex-end">
      <Button
        size="sm"
        variant="outline"
        leftIcon={<ChevronLeftIcon />}
        onClick={() => onChange(Math.max(0, pageIndex - 1))}
        isDisabled={pageIndex === 0}
      >
        Prev
      </Button>
      <Text fontSize="xs" color="gray.400">
        {pageIndex + 1} / {pageCount}
      </Text>
      <Button
        size="sm"
        variant="outline"
        rightIcon={<ChevronRightIcon />}
        onClick={() => onChange(Math.min(pageCount - 1, pageIndex + 1))}
        isDisabled={pageIndex >= pageCount - 1}
      >
        Next
      </Button>
    </HStack>
  );
}
