'use client';

import {
  Box,
  Button,
  Grid,
  Heading,
  HStack,
  SimpleGrid,
  Skeleton,
  Text,
  Tooltip,
  VStack,
} from '@chakra-ui/react';
import NextLink from 'next/link';
import { useMemo } from 'react';
import { Eyebrow } from '@ui/Eyebrow';
import { InfoBlock } from '@ui/InfoBlock';
import { LoadingCard } from '@ui/LoadingCard';
import { EvonodesLeaderboard } from '@components/charts/EvonodesLeaderboard';
import { VotePollsList } from '@components/governance/VotePollsList';
import { CreditsBlock } from '@components/data/CreditsBlock';
import { Identifier } from '@components/data/Identifier';
import { ProofGlyph } from '@components/proof/ProofGlyph';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import {
  useCurrentEpoch,
  useCurrentQuorumsInfo,
  useEvonodesBlocksByRange,
  useProtocolVersionUpgradeState,
  useSystemStatus,
  useTotalCreditsInPlatform,
  useVotePollsByEndDate,
} from '@sdk/queries';
import { WELL_KNOWN } from '@constants/well-known';
import { useSdk } from '@sdk/hooks';
import { evonodesMapToBars, normaliseEpoch } from '@util/epoch';
import { toPlain } from '@util/contract';
import { readProp } from '@util/sdk-shape';
import type { ProofStatus } from '@components/proof/ProofInspectorContext';
import type { QueryProofEntry } from '@/contexts/QueryProofStore';

function getQuorumsCount(raw: unknown): number | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw.length;
  if (raw instanceof Map) return raw.size;
  const qt = readProp<unknown[]>(raw, 'quorums');
  return Array.isArray(qt) ? qt.length : null;
}

function StatCell({
  label,
  value,
  footnote,
  proofStatus,
  proofTitle,
  proofEntry,
  loading,
  error,
}: {
  label: string;
  value: React.ReactNode;
  footnote?: React.ReactNode;
  proofStatus?: ProofStatus;
  proofTitle?: string;
  proofEntry?: QueryProofEntry;
  loading?: boolean;
  error?: Error | null;
}) {
  const errored = !loading && !!error;
  const effectiveStatus: ProofStatus | undefined = errored
    ? 'failed'
    : proofStatus;
  return (
    <Box
      px={{ base: 4, md: 5 }}
      py={4}
      borderRight={{ base: 'none', lg: '1px solid' }}
      borderRightColor={{ base: 'transparent', lg: 'hairline' }}
      borderBottom={{ base: '1px solid', lg: 'none' }}
      borderBottomColor={{ base: 'hairline', lg: 'transparent' }}
      _last={{ borderRight: 'none', borderBottom: 'none' }}
    >
      <Eyebrow mb={2}>{label}</Eyebrow>
      <HStack spacing={2} align="baseline">
        {effectiveStatus ? (
          <ProofGlyph
            status={effectiveStatus}
            label={errored ? `${proofTitle ?? label}: ${error?.message ?? 'failed'}` : undefined}
            payload={
              errored
                ? { title: proofTitle ?? label, status: 'failed', notes: error?.message }
                : proofTitle
                  ? { title: proofTitle, status: effectiveStatus, entry: proofEntry }
                  : undefined
            }
          />
        ) : null}
        {loading ? (
          <Skeleton height="22px" width="80px" startColor="sunken" endColor="raised" />
        ) : errored ? (
          <Tooltip
            label={error?.message ?? 'request failed'}
            hasArrow
            placement="bottom"
            openDelay={200}
            bg="failed"
            color="bg"
          >
            <Text
              fontFamily="mono"
              fontSize="sm"
              color="failed"
              cursor="help"
              sx={{ textDecorationLine: 'underline', textDecorationStyle: 'dotted' }}
            >
              error
            </Text>
          </Tooltip>
        ) : (
          value
        )}
      </HStack>
      {footnote ? (
        <Text fontFamily="mono" fontSize="11px" color="muted" mt={1.5}>
          {footnote}
        </Text>
      ) : null}
    </Box>
  );
}

export default function HomePage() {
  usePageBreadcrumbs([]);
  const { network, trusted, status } = useSdk();
  const proofsOn = trusted && status === 'ready';
  const proofStatus: ProofStatus = proofsOn ? 'verified' : 'trusted';

  const statusQ = useSystemStatus();
  const epochQ = useCurrentEpoch();
  const creditsQ = useTotalCreditsInPlatform();
  const protocolQ = useProtocolVersionUpgradeState();
  const quorumsQ = useCurrentQuorumsInfo();

  const epoch = epochQ.data ? normaliseEpoch(epochQ.data) : null;
  const evonodesQ = useEvonodesBlocksByRange(epoch?.index, 20);
  const bars = evonodesMapToBars(evonodesQ.data);

  const nowBucket = Math.floor(Date.now() / 60_000) * 60_000;
  const in30d = nowBucket + 30 * 86_400_000;
  const pollsQ = useVotePollsByEndDate(nowBucket, in30d);
  const polls = (pollsQ.data as unknown[] | undefined) ?? [];

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
  const statusNetwork = (statusPlain.network as Record<string, unknown> | undefined) ?? {};
  const chainId =
    (statusNetwork.chainId as string | undefined) ?? readProp<string>(statusPlain, 'chainId');
  const quorumsCount = getQuorumsCount(quorumsQ.data);

  const protocolCurrent = readProp<unknown>(protocolQ.data, 'currentProtocolVersion');
  const protocolPending = readProp<unknown>(protocolQ.data, 'nextProtocolVersion');

  return (
    <VStack align="stretch" spacing={8} py={{ base: 4, md: 8 }}>
      {/* Hero — type on bare page, no card */}
      <VStack align="flex-start" spacing={3} maxW="64ch">
        <Eyebrow tracking="0.18em">Native Platform Explorer · {network}</Eyebrow>
        <Heading
          as="h1"
          fontSize={{ base: '3xl', md: '4xl', lg: '5xl' }}
          color="ink"
          fontWeight={400}
          lineHeight={1.05}
          letterSpacing="-0.02em"
        >
          A proof-verified, client-only Dash Platform explorer.
        </Heading>
        <Text color="muted" fontSize="md" maxW="60ch">
          Every value below is fetched live by{' '}
          <Box as="code" color="ink" fontFamily="mono" fontSize="sm">
            @dashevo/evo-sdk
          </Box>{' '}
          running in your browser. Proofs are verified locally; click any{' '}
          <Box as="span" color={proofsOn ? 'verified' : 'trusted'} fontSize="10px">
            ●
          </Box>{' '}
          to inspect.
        </Text>
      </VStack>

      {/* Stat strip — five cells in a single hairline-divided row */}
      <Box border="1px solid" borderColor="hairline" borderRadius="card" bg="surface">
        <SimpleGrid columns={{ base: 1, lg: 5 }} spacing={0}>
          <StatCell
            label="Block height"
            proofStatus={proofStatus}
            proofTitle="Block height proof"
            proofEntry={statusQ.proofEntry}
            loading={statusQ.isLoading}
            error={statusQ.error}
            value={
              <Text
                fontFamily="heading"
                fontSize="3xl"
                color="ink"
                fontWeight={500}
                sx={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {blockHeight !== undefined ? String(blockHeight) : '—'}
              </Text>
            }
            footnote={statusQ.isLoading ? 'fetching…' : 'live'}
          />

          <StatCell
            label="Current epoch"
            proofStatus={proofStatus}
            proofTitle="Epoch proof"
            proofEntry={epochQ.proofEntry}
            loading={epochQ.isLoading}
            error={epochQ.error}
            value={
              <Text
                as={NextLink}
                href="/epoch/"
                fontFamily="heading"
                fontSize="3xl"
                color="ink"
                fontWeight={500}
                _hover={{ color: 'accent' }}
              >
                #{epoch?.index ?? '—'}
              </Text>
            }
            footnote={
              epoch?.progressPct != null ? `${epoch.progressPct.toFixed(1)}% complete` : undefined
            }
          />

          <StatCell
            label="Total credits"
            proofStatus={proofStatus}
            proofTitle="Total credits proof"
            proofEntry={creditsQ.proofEntry}
            loading={creditsQ.isLoading}
            error={creditsQ.error}
            value={<CreditsBlock credits={(creditsQ.data as bigint | undefined) ?? null} />}
            footnote="platform supply"
          />

          <StatCell
            label="Protocol version"
            proofStatus={proofStatus}
            proofTitle="Protocol version proof"
            proofEntry={protocolQ.proofEntry}
            loading={protocolQ.isLoading}
            error={protocolQ.error}
            value={
              <Text
                fontFamily="heading"
                fontSize="3xl"
                color="ink"
                fontWeight={500}
                sx={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {protocolCurrent !== undefined ? `v${String(protocolCurrent)}` : '—'}
              </Text>
            }
            footnote={
              protocolPending ? (
                <Text as="span" color="warning">
                  upgrade → v{String(protocolPending)}
                </Text>
              ) : (
                'no pending upgrade'
              )
            }
          />

          <StatCell
            label="Active quorums"
            proofStatus={proofStatus}
            proofTitle="Active quorums proof"
            proofEntry={quorumsQ.proofEntry}
            loading={quorumsQ.isLoading}
            error={quorumsQ.error}
            value={
              <Text
                fontFamily="heading"
                fontSize="3xl"
                color="ink"
                fontWeight={500}
                sx={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {quorumsCount ?? '—'}
              </Text>
            }
            footnote="signing this height"
          />
        </SimpleGrid>
      </Box>

      {/* Top proposers */}
      <InfoBlock>
        <HStack justify="space-between" mb={3}>
          <Eyebrow size="11px">
            Top proposers · epoch {epoch ? `#${epoch.index}` : '—'}
          </Eyebrow>
          <Button
            as={NextLink}
            href="/epoch/"
            size="xs"
            variant="ghost"
            color="accent"
            fontFamily="mono"
            fontSize="11px"
          >
            view epoch →
          </Button>
        </HStack>
        {epochQ.isLoading || evonodesQ.isLoading ? (
          <LoadingCard lines={5} />
        ) : (
          <EvonodesLeaderboard entries={bars} limit={10} />
        )}
      </InfoBlock>

      {/* Bottom grid */}
      <Grid templateColumns={{ base: '1fr', lg: '3fr 2fr' }} gap={4}>
        <InfoBlock>
          <HStack justify="space-between" mb={3}>
            <Eyebrow size="11px">Vote polls ending soon</Eyebrow>
            <Button
              as={NextLink}
              href="/governance/polls/"
              size="xs"
              variant="ghost"
              color="accent"
              fontFamily="mono"
              fontSize="11px"
            >
              all polls →
            </Button>
          </HStack>
          {pollsQ.isLoading ? (
            <LoadingCard lines={3} />
          ) : polls.length === 0 ? (
            <Text color="muted" fontSize="sm" fontFamily="mono">
              No polls ending in the next 30 days.
            </Text>
          ) : (
            <VotePollsList entries={polls.slice(0, 10)} />
          )}
        </InfoBlock>

        <InfoBlock>
          <Eyebrow size="11px" mb={3}>
            Well-known contracts
          </Eyebrow>
          <VStack align="stretch" spacing={0} divider={<Box h="1px" bg="hairline" />}>
            {WELL_KNOWN.map((w) => (
              <Box
                key={w.id}
                as={NextLink}
                href={`/contract/?id=${encodeURIComponent(w.id)}`}
                display="flex"
                alignItems="center"
                justifyContent="space-between"
                py={2.5}
                _hover={{ color: 'accent' }}
                transition="color 0.12s ease"
              >
                <Text fontSize="13px" color="ink" fontWeight={400}>
                  {w.name}
                </Text>
                <Identifier value={w.id} dense avatar={false} copy={false} />
              </Box>
            ))}
          </VStack>
        </InfoBlock>
      </Grid>

      <Text fontSize="xs" color="muted" textAlign="center" fontFamily="mono">
        {chainId ?? '—'}
      </Text>
    </VStack>
  );
}
