'use client';

import { Text } from '@chakra-ui/react';
import { getTimeDelta } from '@util/datetime';
import { NotActive } from './NotActive';

export function TimeDelta({
  value,
  detailed = false,
}: {
  value: Date | number | string | bigint | null | undefined;
  detailed?: boolean;
}) {
  const delta = getTimeDelta(value);
  if (!delta) return <NotActive />;
  return (
    <Text as="span" fontFamily="mono" fontSize="xs" color="gray.250">
      {detailed ? delta.full : delta.short}
    </Text>
  );
}
