'use client';

import NextLink from 'next/link';
import { Button, HStack } from '@chakra-ui/react';
import { ChevronLeftIcon, ChevronRightIcon } from '@chakra-ui/icons';
import { MAX_EPOCH_INDEX } from '@sdk/epoch-queries';

/** Links from one epoch to its neighbours and to the history table. `index`
 *  is the epoch being viewed; `currentIndex`, once known, stops "next" at the
 *  current epoch, which lives on /epoch/ rather than the detail page. */
export function EpochNav({ index, currentIndex }: { index: number | undefined; currentIndex?: number }) {
  const prev = index !== undefined && index > 0 ? index - 1 : undefined;
  const next = index !== undefined && index < MAX_EPOCH_INDEX && (currentIndex === undefined || index < currentIndex)
    ? index + 1
    : undefined;
  const nextIsCurrent = next !== undefined && next === currentIndex;
  const historyTo = index !== undefined ? `?to=${index}` : '';

  return (
    <HStack as="nav" aria-label="Epoch navigation" spacing={2} flexWrap="wrap">
      {prev !== undefined ? (
        <Button as={NextLink} href={`/epoch/detail/?index=${prev}`} size="xs" variant="outline" leftIcon={<ChevronLeftIcon />}>
          Epoch #{prev}
        </Button>
      ) : null}
      {next !== undefined ? (
        <Button
          as={NextLink}
          href={nextIsCurrent ? '/epoch/' : `/epoch/detail/?index=${next}`}
          size="xs"
          variant="outline"
          rightIcon={<ChevronRightIcon />}
        >
          {nextIsCurrent ? `Current epoch #${next}` : `Epoch #${next}`}
        </Button>
      ) : null}
      <Button as={NextLink} href={`/epoch/history/${historyTo}`} size="xs" variant="ghost">
        Epoch history
      </Button>
    </HStack>
  );
}
