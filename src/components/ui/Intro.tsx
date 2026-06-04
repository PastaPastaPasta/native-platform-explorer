'use client';

import { Box, Heading, Text } from '@chakra-ui/react';
import type { ReactNode } from 'react';
import { Eyebrow } from './Eyebrow';

export interface IntroProps {
  /** Small-caps eyebrow above the title — e.g. "IDENTITY". Optional. */
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
}

export function Intro({ eyebrow, title, description, children }: IntroProps) {
  return (
    <Box mb={{ base: 6, md: 8 }} pt={{ base: 4, md: 6 }}>
      {eyebrow ? (
        <Eyebrow as="p" size="xs" mb={2}>
          {eyebrow}
        </Eyebrow>
      ) : null}
      <Heading
        as="h1"
        fontSize={{ base: '2xl', md: '3xl', lg: '4xl' }}
        fontFamily="heading"
        color="ink"
        mb={3}
      >
        {title}
      </Heading>
      {description ? (
        <Text color="muted" fontSize={{ base: 'md', md: 'lg' }} maxW="70ch">
          {description}
        </Text>
      ) : null}
      {children}
    </Box>
  );
}
