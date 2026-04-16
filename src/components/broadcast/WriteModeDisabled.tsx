'use client';

import { Heading, Text } from '@chakra-ui/react';
import { Container } from '@ui/Container';
import { InfoBlock } from '@ui/InfoBlock';

export function WriteModeDisabled({ context }: { context: 'wallet' | 'broadcast' }) {
  return (
    <Container py={{ base: 4, md: 6 }}>
      <InfoBlock emphasised>
        <Heading size="md" color="gray.100" mb={2}>
          Write mode is disabled
        </Heading>
        <Text color="gray.250">
          This deployment was built with <code>NEXT_PUBLIC_DISABLE_WRITE_MODE=true</code>,
          so the {context === 'wallet' ? 'wallet setup' : 'broadcast console'} is not
          available. Every read-only surface of the explorer still works.
        </Text>
      </InfoBlock>
    </Container>
  );
}
