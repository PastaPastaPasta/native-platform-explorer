'use client';

import { Box, Flex, HStack, Text, VStack } from '@chakra-ui/react';
import { useMemo } from 'react';
import { Eyebrow } from '@ui/Eyebrow';
import { useSdk } from '@sdk/hooks';
import {
  useCurrentEpoch,
  useCurrentQuorumsInfo,
  useSystemStatus,
} from '@sdk/queries';
import { normaliseEpoch } from '@util/epoch';
import { toPlain } from '@util/contract';
import { readProp } from '@util/sdk-shape';

function Field({
  label,
  children,
  divider = true,
}: {
  label: string;
  children: React.ReactNode;
  divider?: boolean;
}) {
  return (
    <HStack spacing={0} align="stretch" h="100%">
      <VStack align="flex-start" spacing="2px" justify="center" px={{ base: 3, md: 4 }} py={2}>
        <Eyebrow size="9px" tracking="0.16em">
          {label}
        </Eyebrow>
        <Box>{children}</Box>
      </VStack>
      {divider ? <Box w="1px" bg="hairline" /> : null}
    </HStack>
  );
}

function getQuorumsCount(raw: unknown): number | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw.length;
  if (raw instanceof Map) return raw.size;
  const qt = readProp<unknown[]>(raw, 'quorums');
  return Array.isArray(qt) ? qt.length : null;
}

export function MeterBar() {
  const { network, trusted, status } = useSdk();
  const statusQ = useSystemStatus();
  const epochQ = useCurrentEpoch();
  const quorumsQ = useCurrentQuorumsInfo();

  const epoch = epochQ.data ? normaliseEpoch(epochQ.data) : null;

  const statusPlain = useMemo(
    () => (statusQ.data ? ((toPlain(statusQ.data) as Record<string, unknown>) ?? {}) : {}),
    [statusQ.data],
  );
  const chain = (statusPlain.chain as Record<string, unknown> | undefined) ?? {};
  const blockHeight =
    (chain.latestBlockHeight as number | bigint | undefined) ??
    (chain.blockHeight as number | bigint | undefined) ??
    (chain.height as number | bigint | undefined) ??
    readProp<number | bigint>(statusPlain, 'height');

  const proofsOn = trusted && status === 'ready';
  const quorumsCount = getQuorumsCount(quorumsQ.data);
  const progress = epoch?.progressPct ?? null;

  return (
    <Box
      as="div"
      position="sticky"
      top={0}
      zIndex={15}
      borderBottom="1px solid"
      borderColor="hairline"
      bg="bg"
      h="40px"
      overflow="hidden"
    >
      <Flex h="100%" align="stretch" justify="flex-start" overflowX="auto">
        <Field label="Block">
          <Text fontFamily="mono" fontSize="13px" color="ink" data-mono>
            {blockHeight !== undefined ? String(blockHeight) : '—'}
          </Text>
        </Field>

        <Field label="Epoch">
          <HStack spacing={2}>
            <Text fontFamily="mono" fontSize="13px" color="ink">
              #{epoch?.index ?? '—'}
            </Text>
            <Box position="relative" w="80px" h="6px" bg="sunken" borderRadius="badge">
              <Box
                position="absolute"
                inset="0 auto 0 0"
                w={`${progress ?? 0}%`}
                bg="accent"
                borderRadius="badge"
                transition="width 0.5s ease"
              />
              {/* ruler ticks */}
              {[25, 50, 75].map((p) => (
                <Box
                  key={p}
                  position="absolute"
                  top="-1px"
                  bottom="-1px"
                  left={`${p}%`}
                  w="1px"
                  bg="hairlineStrong"
                />
              ))}
            </Box>
            {progress != null ? (
              <Text fontFamily="mono" fontSize="11px" color="muted" minW="34px">
                {progress.toFixed(0)}%
              </Text>
            ) : null}
          </HStack>
        </Field>

        <Field label="Proofs">
          <HStack spacing={1.5}>
            <Text
              as="span"
              color={proofsOn ? 'verified' : 'trusted'}
              fontSize="10px"
              lineHeight={1}
            >
              ●
            </Text>
            <Text fontFamily="mono" fontSize="13px" color="ink">
              {proofsOn ? 'ON' : 'OFF'}
            </Text>
          </HStack>
        </Field>

        <Field label="Quorums">
          <Text fontFamily="mono" fontSize="13px" color="ink">
            {quorumsCount ?? '—'}
          </Text>
        </Field>

        <Field label="Network" divider={false}>
          <Text fontFamily="mono" fontSize="13px" color="ink">
            {network}
          </Text>
        </Field>
      </Flex>
    </Box>
  );
}
