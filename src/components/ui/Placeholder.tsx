'use client';

import { Box, Code, Text, VStack } from '@chakra-ui/react';
import type { ReactNode } from 'react';
import { Container } from './Container';
import { InfoBlock } from './InfoBlock';
import { Intro } from './Intro';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import type { BreadcrumbItem } from '@contexts/BreadcrumbsContext';

export interface PlaceholderProps {
  title: string;
  description?: ReactNode;
  stage: 1 | 2 | 3 | 4 | 5 | 6;
  breadcrumbs?: BreadcrumbItem[];
  params?: Record<string, string | string[] | undefined>;
}

export function Placeholder({ title, description, stage, breadcrumbs, params }: PlaceholderProps) {
  usePageBreadcrumbs(breadcrumbs ?? [{ label: title }]);

  return (
    <Container py={{ base: 4, md: 6 }}>
      <Intro title={title} description={description} />
      <InfoBlock emphasised={stage === 2}>
        <VStack align="flex-start" spacing={3}>
          <Text fontSize="sm" color="gray.250">
            This page will be implemented in <strong>Stage {stage}</strong> of the build plan.
          </Text>
          {params && Object.keys(params).length > 0 ? (
            <Box>
              <Text fontSize="xs" color="gray.400" mb={2}>
                Dynamic segments received:
              </Text>
              <Code fontFamily="mono" fontSize="xs" p={3} bg="gray.800" color="brand.light" borderRadius="md">
                {JSON.stringify(params, null, 2)}
              </Code>
            </Box>
          ) : null}
        </VStack>
      </InfoBlock>
    </Container>
  );
}
