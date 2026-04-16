'use client';

import { Text } from '@chakra-ui/react';
import { numberFormat } from '@util/numbers';
import { NotActive } from './NotActive';

export function BigNumberDisplay({
  value,
  decimals = 0,
  suffix,
}: {
  value: bigint | number | string | null | undefined;
  decimals?: number;
  suffix?: string;
}) {
  if (value === null || value === undefined) return <NotActive />;
  return (
    <Text as="span" fontFamily="mono" fontSize="md" color="gray.100">
      {numberFormat(value, decimals)}
      {suffix ? (
        <Text as="span" color="gray.400" fontSize="xs" ml={1}>
          {suffix}
        </Text>
      ) : null}
    </Text>
  );
}
