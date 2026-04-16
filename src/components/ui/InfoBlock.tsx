'use client';

import { Box, type BoxProps } from '@chakra-ui/react';
import type { ReactNode } from 'react';

export interface InfoBlockProps extends Omit<BoxProps, 'title'> {
  emphasised?: boolean;
  children?: ReactNode;
}

/** Glass card wrapper — matches the `Block()` SCSS mixin. */
export function InfoBlock({ emphasised, children, ...rest }: InfoBlockProps) {
  return (
    <Box
      borderRadius="block"
      border="1px solid rgba(255,255,255,0.1)"
      bg="rgba(24,31,34,0.2)"
      sx={{ backdropFilter: 'blur(44px)' }}
      boxShadow={emphasised ? '2px 2px var(--chakra-colors-brand-normal)' : undefined}
      p={{ base: 5, md: 6 }}
      {...rest}
    >
      {children}
    </Box>
  );
}
