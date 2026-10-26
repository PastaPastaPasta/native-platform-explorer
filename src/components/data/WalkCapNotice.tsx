'use client';

import { Text } from '@chakra-ui/react';
import { isTruncatedWalk } from '@util/paged-walk';

/** Shown when a paginated walk stopped at its page cap, so totals and ranks
 *  computed from it may be missing entries. Renders nothing otherwise. */
export function WalkCapNotice({ data, what }: { data: unknown; what: string }) {
  if (!isTruncatedWalk(data)) return null;
  return (
    <Text fontSize="xs" color="warning" role="status">
      Results may be incomplete: reading {what} stopped at the page limit.
    </Text>
  );
}
