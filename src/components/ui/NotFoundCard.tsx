'use client';

import { Button, Heading, Text, VStack, HStack } from '@chakra-ui/react';
import NextLink from 'next/link';
import type { ReactNode } from 'react';
import { InfoBlock } from './InfoBlock';

export interface NotFoundCardProps {
  title?: string;
  description?: ReactNode;
  actions?: Array<{ label: string; href: string }>;
}

export function NotFoundCard({
  title = 'Not found',
  description = 'The entity you were looking for is not on Platform right now.',
  actions = [{ label: 'Return home', href: '/' }],
}: NotFoundCardProps) {
  return (
    <InfoBlock>
      <VStack align="flex-start" spacing={3}>
        <Heading as="h2" size="md" color="gray.100">
          {title}
        </Heading>
        <Text color="gray.250">{description}</Text>
        <HStack spacing={3} pt={2}>
          {actions.map((a) => (
            <Button
              key={a.href}
              as={NextLink}
              href={a.href}
              colorScheme="blue"
              variant="outline"
              size="sm"
            >
              {a.label}
            </Button>
          ))}
        </HStack>
      </VStack>
    </InfoBlock>
  );
}
