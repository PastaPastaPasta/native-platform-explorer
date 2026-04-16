'use client';

import { Box, HStack, Text } from '@chakra-ui/react';
import type { ReactNode } from 'react';

/** Label/value row used across DigestCards to match platform-explorer's
 *  right-aligned value layout: the label sits on the left in small uppercase
 *  gray text, the value floats on the right in mono. Responsive — stacks
 *  vertically on small screens. */
export function DigestRow({
  label,
  value,
  align = 'center',
}: {
  label: ReactNode;
  value: ReactNode;
  align?: 'center' | 'flex-start';
}) {
  return (
    <HStack
      justify="space-between"
      align={{ base: 'flex-start', sm: align }}
      spacing={4}
      width="100%"
      flexWrap={{ base: 'wrap', sm: 'nowrap' }}
      py={1.5}
      borderBottom="1px solid"
      borderColor="whiteAlpha.50"
      _last={{ borderBottom: 'none' }}
    >
      <Text
        fontSize="xs"
        color="gray.250"
        textTransform="none"
        fontWeight={400}
        flexShrink={0}
      >
        {label}
      </Text>
      <Box textAlign={{ base: 'left', sm: 'right' }} flex="1" minW="0">
        {value}
      </Box>
    </HStack>
  );
}
