'use client';

import { Text, Tooltip } from '@chakra-ui/react';
import { formatDate, getTimeDelta } from '@util/datetime';
import { NotActive } from './NotActive';

export interface DateBlockProps {
  value: Date | number | string | bigint | null | undefined;
  relative?: boolean;
  dim?: boolean;
}

export function DateBlock({ value, relative = false, dim = false }: DateBlockProps) {
  if (value === null || value === undefined) return <NotActive />;
  const abs = formatDate(value);
  const delta = getTimeDelta(value);

  if (relative && delta) {
    return (
      <Tooltip label={abs} hasArrow>
        <Text as="span" fontFamily="mono" fontSize="xs" color={dim ? 'gray.400' : 'gray.100'}>
          {delta.short}
        </Text>
      </Tooltip>
    );
  }

  return (
    <Tooltip label={delta?.full ?? abs} hasArrow>
      <Text as="span" fontFamily="mono" fontSize="xs" color={dim ? 'gray.400' : 'gray.100'}>
        {abs}
      </Text>
    </Tooltip>
  );
}
