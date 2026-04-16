'use client';

import { Box, Heading, Text } from '@chakra-ui/react';
import type { ReactNode } from 'react';

export interface IntroProps {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
}

export function Intro({ title, description, children }: IntroProps) {
  return (
    <Box mb={{ base: 6, md: 8 }} pt={{ base: 4, md: 6 }}>
      <Heading
        as="h1"
        fontSize={{ base: '2xl', md: '3xl', lg: '4xl' }}
        fontFamily="heading"
        color="gray.100"
        mb={3}
      >
        {title}
      </Heading>
      {description ? (
        <Text color="gray.250" fontSize={{ base: 'md', md: 'lg' }} maxW="70ch">
          {description}
        </Text>
      ) : null}
      {children}
    </Box>
  );
}
