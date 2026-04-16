'use client';

import { Box, type BoxProps } from '@chakra-ui/react';
import { forwardRef } from 'react';

export const Container = forwardRef<HTMLDivElement, BoxProps>(function Container(
  { children, ...rest },
  ref,
) {
  return (
    <Box
      ref={ref}
      maxWidth="1310px"
      width="100%"
      mx="auto"
      px={{ base: 4, md: 6, xl: 8 }}
      {...rest}
    >
      {children}
    </Box>
  );
});
