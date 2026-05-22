'use client';

import { Button, Divider, HStack, Heading, Text, VStack } from '@chakra-ui/react';
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
        <Text fontFamily="mono" fontSize="xs" color="muted" letterSpacing="0.1em">
          404 · NOT FOUND
        </Text>
        <Heading as="h2" size="md" color="ink">
          {title}
        </Heading>
        <Text color="muted" maxW="60ch">
          {description}
        </Text>
        <Divider borderColor="hairline" my={1} />
        <HStack spacing={3}>
          {actions.map((a) => (
            <Button
              key={a.href}
              as={NextLink}
              href={a.href}
              variant="outline"
              borderColor="hairlineStrong"
              color="ink"
              size="sm"
              borderRadius="card"
            >
              {a.label}
            </Button>
          ))}
        </HStack>
      </VStack>
    </InfoBlock>
  );
}
