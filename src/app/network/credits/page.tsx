'use client';

import { useState } from 'react';
import {
  Button,
  Heading,
  HStack,
  Input,
  Text,
  VStack,
} from '@chakra-ui/react';
import { Container } from '@ui/Container';
import { InfoBlock } from '@ui/InfoBlock';
import { LoadingCard } from '@ui/LoadingCard';
import { ErrorCard } from '@ui/ErrorCard';
import { InfoLine } from '@components/data/InfoLine';
import { CreditsBlock } from '@components/data/CreditsBlock';
import { CodeBlock } from '@components/data/CodeBlock';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import {
  usePrefundedSpecializedBalance,
  useTotalCreditsInPlatform,
} from '@sdk/queries';

export default function Page() {
  usePageBreadcrumbs([{ label: 'Home', href: '/' }, { label: 'Network' }, { label: 'Credits' }]);

  const totalQ = useTotalCreditsInPlatform();
  const [input, setInput] = useState('');
  const [target, setTarget] = useState<string | undefined>(undefined);
  const balanceQ = usePrefundedSpecializedBalance(target);

  return (
    <Container py={{ base: 4, md: 6 }}>
      <VStack align="stretch" spacing={4}>
        <InfoBlock emphasised>
          <VStack align="flex-start" spacing={2}>
            <Heading size="md" color="gray.100">
              Total credits on Platform
            </Heading>
            {totalQ.isLoading ? (
              <LoadingCard lines={1} />
            ) : totalQ.isError ? (
              <ErrorCard error={totalQ.error} onRetry={() => totalQ.refetch()} />
            ) : (
              <CreditsBlock credits={(totalQ.data as bigint | undefined) ?? null} />
            )}
          </VStack>
        </InfoBlock>

        <InfoBlock>
          <VStack align="stretch" spacing={3}>
            <Heading size="sm" color="gray.100">
              Prefunded specialized balance lookup
            </Heading>
            <HStack spacing={2}>
              <Input
                size="sm"
                placeholder="Identity ID"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                fontFamily="mono"
                bg="gray.800"
                borderColor="gray.700"
              />
              <Button
                size="sm"
                colorScheme="blue"
                onClick={() => setTarget(input.trim() || undefined)}
                isDisabled={input.trim().length === 0}
              >
                Look up
              </Button>
            </HStack>
            {target ? (
              balanceQ.isLoading ? (
                <LoadingCard lines={1} />
              ) : balanceQ.isError ? (
                <ErrorCard error={balanceQ.error} onRetry={() => balanceQ.refetch()} />
              ) : !balanceQ.data ? (
                <Text color="gray.400" fontSize="sm">
                  No prefunded balance recorded for that identity.
                </Text>
              ) : (
                <InfoLine
                  label="Balance"
                  value={<CodeBlock value={balanceQ.data} />}
                />
              )
            ) : null}
          </VStack>
        </InfoBlock>
      </VStack>
    </Container>
  );
}
