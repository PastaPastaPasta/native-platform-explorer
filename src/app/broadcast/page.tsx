'use client';

import { Suspense, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import NextLink from 'next/link';
import {
  Button,
  Grid,
  Heading,
  HStack,
  Text,
  VStack,
} from '@chakra-ui/react';
import { Container } from '@ui/Container';
import { InfoBlock } from '@ui/InfoBlock';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import { WriteModeDisabled } from '@components/broadcast/WriteModeDisabled';
import { OperationShell } from '@components/broadcast/OperationShell';
import { OPERATIONS } from '@components/broadcast/operations';
import { getConfig } from '@/config';

function Content() {
  const router = useRouter();
  const params = useSearchParams();
  const facade = params.get('facade') ?? 'identities';
  const op = params.get('op') ?? '';

  usePageBreadcrumbs([{ label: 'Home', href: '/' }, { label: 'Broadcast' }]);

  const facades = useMemo(() => Array.from(new Set(OPERATIONS.map((o) => o.facade))), []);
  const operations = OPERATIONS.filter((o) => o.facade === facade);
  const selected = OPERATIONS.find((o) => o.facade === facade && o.op === op);

  const pickOp = (nextFacade: string, nextOp: string) => {
    const qp = new URLSearchParams();
    qp.set('facade', nextFacade);
    qp.set('op', nextOp);
    router.push(`/broadcast/?${qp.toString()}`);
  };

  return (
    <Container py={{ base: 4, md: 6 }}>
      <VStack align="stretch" spacing={4}>
        <InfoBlock emphasised>
          <VStack align="flex-start" spacing={1}>
            <Heading size="md" color="gray.100">
              Broadcast console
            </Heading>
            <Text fontSize="sm" color="gray.250">
              Build, sign, and broadcast a state transition. Every operation runs through
              the shared Build → Review → Sign → Broadcast → Result flow.
            </Text>
          </VStack>
        </InfoBlock>

        <Grid templateColumns={{ base: '1fr', md: '220px 1fr' }} gap={4}>
          <VStack align="stretch" spacing={2}>
            <InfoBlock>
              <Text fontSize="xs" color="gray.400" textTransform="uppercase" mb={2}>
                Facades
              </Text>
              <VStack align="stretch" spacing={1}>
                {facades.map((f) => (
                  <Button
                    key={f}
                    size="sm"
                    variant={f === facade ? 'solid' : 'outline'}
                    colorScheme="blue"
                    onClick={() =>
                      pickOp(
                        f,
                        OPERATIONS.find((o) => o.facade === f)?.op ?? '',
                      )
                    }
                  >
                    {f}
                  </Button>
                ))}
              </VStack>
            </InfoBlock>
            <InfoBlock>
              <Text fontSize="xs" color="gray.400" textTransform="uppercase" mb={2}>
                Operations
              </Text>
              <VStack align="stretch" spacing={1}>
                {operations.map((o) => (
                  <Button
                    key={o.op}
                    size="sm"
                    variant={o.op === op ? 'solid' : 'outline'}
                    colorScheme="blue"
                    onClick={() => pickOp(o.facade, o.op)}
                  >
                    {o.op}
                  </Button>
                ))}
              </VStack>
            </InfoBlock>
            <InfoBlock>
              <Text fontSize="xs" color="gray.400" mb={2}>
                Need a signer?
              </Text>
              <Button as={NextLink} href="/wallet/" size="sm" variant="outline">
                Open /wallet
              </Button>
            </InfoBlock>
          </VStack>

          {selected ? (
            <OperationShell descriptor={selected.descriptor} />
          ) : (
            <InfoBlock>
              <VStack align="flex-start" spacing={2}>
                <Heading size="sm" color="gray.100">
                  Pick an operation
                </Heading>
                <Text fontSize="sm" color="gray.250">
                  Choose a facade and operation from the left rail. The explorer ships
                  with a representative set of write flows; the remaining SDK write
                  methods follow the same OperationShell pattern and are tracked as
                  follow-up work.
                </Text>
                <HStack spacing={2} flexWrap="wrap" pt={2}>
                  {OPERATIONS.map((o) => (
                    <Button
                      key={`${o.facade}:${o.op}`}
                      size="sm"
                      variant="outline"
                      onClick={() => pickOp(o.facade, o.op)}
                    >
                      {o.facade}.{o.op}
                    </Button>
                  ))}
                </HStack>
              </VStack>
            </InfoBlock>
          )}
        </Grid>
      </VStack>
    </Container>
  );
}

export default function Page() {
  const config = getConfig();
  if (config.disableWriteMode) {
    return <WriteModeDisabled context="broadcast" />;
  }
  return (
    <Suspense fallback={null}>
      <Content />
    </Suspense>
  );
}
