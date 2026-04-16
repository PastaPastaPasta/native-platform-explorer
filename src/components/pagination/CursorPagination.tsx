'use client';

import { Button, HStack, Text } from '@chakra-ui/react';
import { ChevronLeftIcon, ChevronRightIcon } from '@chakra-ui/icons';

export interface CursorPaginationProps {
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  pageIndex?: number;
}

/** Previous/Next controls for SDK methods that use `startAfter` cursors. */
export function CursorPagination({
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  pageIndex,
}: CursorPaginationProps) {
  return (
    <HStack spacing={2} justify="flex-end">
      <Button
        size="sm"
        variant="outline"
        leftIcon={<ChevronLeftIcon />}
        isDisabled={!hasPrev}
        onClick={onPrev}
      >
        Previous
      </Button>
      {pageIndex !== undefined ? (
        <Text fontSize="xs" color="gray.400" mx={2}>
          page {pageIndex + 1}
        </Text>
      ) : null}
      <Button
        size="sm"
        variant="outline"
        rightIcon={<ChevronRightIcon />}
        isDisabled={!hasNext}
        onClick={onNext}
      >
        Next
      </Button>
    </HStack>
  );
}
