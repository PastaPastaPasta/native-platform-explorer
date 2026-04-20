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
      border="1px solid"
      borderColor={emphasised ? 'rgba(0,141,228,0.3)' : 'rgba(255,255,255,0.08)'}
      bg="linear-gradient(135deg, rgba(24,31,34,0.35) 0%, rgba(24,31,34,0.18) 100%)"
      sx={{ backdropFilter: 'blur(44px)' }}
      boxShadow={
        emphasised
          ? '0 0 0 1px rgba(0,141,228,0.2), 0 4px 24px rgba(0,141,228,0.08)'
          : undefined
      }
      transition="border-color 0.25s ease, box-shadow 0.25s ease"
      _hover={{ borderColor: emphasised ? 'rgba(0,141,228,0.4)' : 'rgba(255,255,255,0.14)' }}
      p={{ base: 5, md: 6 }}
      {...rest}
    >
      {children}
    </Box>
  );
}
