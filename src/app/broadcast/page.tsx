'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import NextLink from 'next/link';
import {
  Box,
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
import { SignerStatusCard } from '@components/broadcast/SignerStatusCard';
import {
  findOperationById,
  GROUPS,
  operationsInGroup,
  type OperationEntry,
  type OperationGroup,
} from '@components/broadcast/operations';
import { getConfig } from '@/config';

function GroupCard({
  group,
  onPick,
}: {
  group: { id: OperationGroup; label: string; blurb: string };
  onPick: (entry: OperationEntry) => void;
}) {
  const ops = operationsInGroup(group.id);
  if (ops.length === 0) return null;
  return (
    <InfoBlock>
      <VStack align="stretch" spacing={3}>
        <Box>
          <Heading size="sm" color="gray.100">
            {group.label}
          </Heading>
          <Text fontSize="xs" color="gray.400" mt={0.5}>
            {group.blurb}
          </Text>
        </Box>
        <VStack align="stretch" spacing={2}>
          {ops.map((o) => (
            <Box
              key={o.id}
              as="button"
              textAlign="left"
              borderRadius="md"
              border="1px solid"
              borderColor="gray.700"
              p={3}
              _hover={{ borderColor: 'brand.light', bg: 'rgba(0,141,228,0.05)' }}
              onClick={() => onPick(o)}
            >
              <Text fontSize="sm" color="gray.100" fontWeight={500}>
                {o.label}
              </Text>
              <Text fontSize="xs" color="gray.400" mt={0.5}>
                {o.blurb}
              </Text>
            </Box>
          ))}
        </VStack>
      </VStack>
    </InfoBlock>
  );
}

function Hub() {
  const router = useRouter();
  const params = useSearchParams();
  const opId = params.get('op');
  const selected = findOperationById(opId);

  usePageBreadcrumbs([{ label: 'Home', href: '/' }, { label: 'Broadcast' }]);

  const pickOp = (entry: OperationEntry) => {
    // Preserve any contextual query params already in the URL (contract, type, id).
    const qp = new URLSearchParams(params.toString());
    qp.set('op', entry.id);
    router.push(`/broadcast/?${qp.toString()}`);
  };

  const clearOp = () => {
    const qp = new URLSearchParams(params.toString());
    qp.delete('op');
    router.push(qp.toString() ? `/broadcast/?${qp.toString()}` : '/broadcast/');
  };

  if (selected) {
    return (
      <Container py={{ base: 4, md: 6 }}>
        <VStack align="stretch" spacing={4}>
          <HStack justify="space-between" align="flex-start" flexWrap="wrap">
            <VStack align="flex-start" spacing={1}>
              <Heading size="md" color="gray.100">
                Broadcast console
              </Heading>
              <Text fontSize="sm" color="gray.250">
                Build, sign, and broadcast a state transition.
              </Text>
            </VStack>
            <Button size="sm" variant="ghost" onClick={clearOp}>
              ← All operations
            </Button>
          </HStack>
          <SignerStatusCard />
          <OperationShell descriptor={selected.descriptor} />
        </VStack>
      </Container>
    );
  }

  return (
    <Container py={{ base: 4, md: 6 }}>
      <VStack align="stretch" spacing={4}>
        <InfoBlock emphasised>
          <VStack align="flex-start" spacing={1}>
            <Heading size="md" color="gray.100">
              Broadcast console
            </Heading>
            <Text fontSize="sm" color="gray.250">
              Pick an operation. Every form runs through the same Build → Review
              → Sign → Broadcast → Result flow with mainnet guardrails.
            </Text>
            <HStack pt={2} spacing={2}>
              <Button as={NextLink} href="/wallet/" size="sm" variant="outline">
                Manage signer
              </Button>
            </HStack>
          </VStack>
        </InfoBlock>
        <SignerStatusCard />
        <Grid
          templateColumns={{ base: '1fr', md: 'repeat(2, 1fr)', xl: 'repeat(3, 1fr)' }}
          gap={4}
        >
          {GROUPS.map((g) => (
            <GroupCard key={g.id} group={g} onPick={pickOp} />
          ))}
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
      <Hub />
    </Suspense>
  );
}
