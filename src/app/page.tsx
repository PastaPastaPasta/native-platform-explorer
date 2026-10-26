'use client';

import {
  Box,
  Button,
  Grid,
  Heading,
  HStack,
  Progress,
  SimpleGrid,
  Skeleton,
  Text,
  Tooltip,
  VStack,
} from '@chakra-ui/react';
import NextLink from 'next/link';
import { useMemo } from 'react';
import { Eyebrow } from '@ui/Eyebrow';
import { LoadingCard } from '@ui/LoadingCard';
import { LookupInput } from '@ui/LookupInput';
import { EvonodesLeaderboard } from '@components/charts/EvonodesLeaderboard';
import { VotePollsList } from '@components/governance/VotePollsList';
import { CreditsBlock } from '@components/data/CreditsBlock';
import { Identifier } from '@components/data/Identifier';
import { ProofGlyph } from '@components/proof/ProofGlyph';
import { WalkCapNotice } from '@components/data/WalkCapNotice';
import { QuorumBreakdownList } from '@components/network/QuorumsTable';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import {
  useAllEvonodeBlocksInEpoch,
  useCurrentEpoch,
  useCurrentQuorumsInfo,
  useProtocolVersionUpgradeState,
  useSystemStatus,
  useTotalCreditsInPlatform,
  useVotePollsByEndDate,
} from '@sdk/queries';
import { WELL_KNOWN } from '@constants/well-known';
import { useSdk } from '@sdk/hooks';
import { normaliseEpoch, summariseProposers, withEpochDuration } from '@util/epoch';
import { networkEpochDurationMs } from '@sdk/current-epoch';
import { isEpochIndex } from '@sdk/epoch-queries';
import { toPlain } from '@util/contract';
import { readProp } from '@util/sdk-shape';
import { normaliseQuorums, quorumBreakdown } from '@util/quorums';
import { isBase58Identifier, looksLikeDpnsName } from '@util/identifier';
import type { ProofStatus } from '@components/proof/ProofInspectorContext';
import type { QueryProofEntry } from '@/contexts/QueryProofStore';
import type { ProofState } from '@sdk/proofs';

// Verification follows the SDK outcome; captured bytes are optional.
function glyphStatus(s: ProofState): ProofStatus {
  switch (s.kind) {
    case 'verified': return 'verified';
    case 'failed': return 'failed';
    case 'unavailable': return 'unavailable';
    default: return 'trusted';
  }
}

/** Field-manual section divider: a small-caps label, a rule line that runs to
 *  the edge, and an optional right-aligned action. Gives secondary sections a
 *  labeled rhythm so the dashboard isn't a stack of identical cards — the only
 *  carded element is the primary vitals readout. */
function SectionHeading({
  label,
  action,
}: {
  label: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <HStack spacing={4} align="center" mb={4}>
      <Eyebrow size="11px" whiteSpace="nowrap">
        {label}
      </Eyebrow>
      <Box flex="1" h="1px" bg="hairline" />
      {action ?? null}
    </HStack>
  );
}

const QUICK_ACTIONS: Array<{
  label: string;
  placeholder: string;
  validate: (v: string) => string | null;
  buildHref: (v: string) => string;
}> = [
  {
    label: 'Look up identity',
    placeholder: 'identity id (base58)',
    validate: (v) => (isBase58Identifier(v) ? null : 'Expected a base58 identifier.'),
    buildHref: (v) => `/identity/?id=${encodeURIComponent(v)}`,
  },
  {
    label: 'Resolve DPNS name',
    placeholder: 'alice.dash',
    validate: (v) => (looksLikeDpnsName(v) ? null : 'Expected a DPNS name such as alice.dash.'),
    buildHref: (v) => `/dpns/?name=${encodeURIComponent(v)}`,
  },
  {
    label: 'Check token',
    placeholder: 'token id (base58)',
    validate: (v) => (isBase58Identifier(v) ? null : 'Expected a base58 token id.'),
    buildHref: (v) => `/token/?id=${encodeURIComponent(v)}`,
  },
  {
    label: 'Check epoch',
    placeholder: 'epoch index',
    validate: (v) => (/^\d+$/.test(v) && isEpochIndex(Number(v)) ? null : 'Expected a whole epoch index.'),
    buildHref: (v) => `/epoch/detail/?index=${Number(v)}`,
  },
];

function StatCell({
  label,
  value,
  footnote,
  meter,
  meterLabel,
  proofStatus,
  proofTitle,
  proofEntry,
  loading,
  error,
}: {
  label: string;
  value: React.ReactNode;
  footnote?: React.ReactNode;
  /** Optional 0–100 progress bar shown between the value and footnote. */
  meter?: number;
  meterLabel?: string;
  proofStatus?: ProofStatus;
  proofTitle?: string;
  proofEntry?: QueryProofEntry;
  loading?: boolean;
  error?: Error | null;
}) {
  const errored = !loading && !!error;
  const effectiveStatus: ProofStatus | undefined = errored
    ? proofStatus === 'failed' ? 'failed' : 'unavailable'
    : proofStatus;
  return (
    <Box
      px={{ base: 4, md: 5 }}
      py={4}
      minW={0}
      borderRight={{ base: 'none', lg: '1px solid' }}
      borderRightColor={{ base: 'transparent', lg: 'hairline' }}
      borderBottom={{ base: '1px solid', lg: 'none' }}
      borderBottomColor={{ base: 'hairline', lg: 'transparent' }}
      _last={{ borderRight: 'none', borderBottom: 'none' }}
    >
      <Eyebrow mb={2}>{label}</Eyebrow>
      <HStack spacing={2} align="baseline" minW={0}>
        {effectiveStatus && !loading ? (
          <ProofGlyph
            status={effectiveStatus}
            label={
              errored
                ? `${proofTitle ?? label}: ${error?.message ?? 'failed'}`
                : proofEntry?.hasProofVariant === false
                  ? 'This endpoint returns no proof — nothing to verify'
                  : undefined
            }
            payload={
              errored
                ? { title: proofTitle ?? label, status: effectiveStatus, notes: error?.message, entry: proofEntry }
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
      {meter !== undefined && !loading && !errored ? (
        <Progress
          value={meter}
          size="xs"
          borderRadius="full"
          bg="sunken"
          mt={2}
          aria-label={meterLabel}
        />
      ) : null}
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

  const statusQ = useSystemStatus();
  const epochQ = useCurrentEpoch();
  const creditsQ = useTotalCreditsInPlatform();
  const protocolQ = useProtocolVersionUpgradeState();
  const quorumsQ = useCurrentQuorumsInfo();

  const epoch = epochQ.data
    ? withEpochDuration(normaliseEpoch(epochQ.data), networkEpochDurationMs(network))
    : null;
  // Rank across every evonode: one page is a proTxHash-ordered slice.
  const evonodesQ = useAllEvonodeBlocksInEpoch(epoch?.index);
  const proposers = summariseProposers(evonodesQ.data);

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
  const quorums = useMemo(() => normaliseQuorums(quorumsQ.data).quorums, [quorumsQ.data]);
  const quorumGroups = useMemo(() => quorumBreakdown(quorums), [quorums]);

  // The running version is the current epoch's; rc.2's versionUpgradeState
  // currentProtocolVersion disagrees with it on both public networks.
  const epochProtocol = readProp<number>(epochQ.data, 'protocolVersion');
  const versionQ = typeof epochProtocol === 'number' ? epochQ : protocolQ;
  const protocolCurrent =
    typeof epochProtocol === 'number'
      ? epochProtocol
      : readProp<number>(protocolQ.data, 'currentProtocolVersion');
  const protocolNext = readProp<number | undefined>(protocolQ.data, 'nextProtocolVersion');
  const protocolPending =
    typeof protocolNext === 'number' && (protocolCurrent === undefined || protocolNext > protocolCurrent)
      ? protocolNext
      : undefined;

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
            proofStatus={glyphStatus(statusQ.proofState)}
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
            proofStatus={glyphStatus(epochQ.proofState)}
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
            meter={epoch?.progressPct ?? undefined}
            meterLabel="Epoch progress"
            footnote={
              epoch?.progressPct != null
                ? `${epoch.progressPct.toFixed(1)}% elapsed (est.)`
                : undefined
            }
          />

          <StatCell
            label="Total credits"
            proofStatus={glyphStatus(creditsQ.proofState)}
            proofTitle="Total credits proof"
            proofEntry={creditsQ.proofEntry}
            loading={creditsQ.isLoading}
            error={creditsQ.error}
            value={
              <CreditsBlock
                credits={(creditsQ.data as bigint | undefined) ?? null}
                layout="headline"
              />
            }
            footnote="platform supply"
          />

          <StatCell
            label="Protocol version"
            proofStatus={glyphStatus(versionQ.proofState)}
            proofTitle="Protocol version proof"
            proofEntry={versionQ.proofEntry}
            loading={versionQ.isLoading}
            error={versionQ.error}
            value={
              <Text
                fontFamily="heading"
                fontSize="3xl"
                color="ink"
                fontWeight={500}
                sx={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {protocolCurrent !== undefined ? `v${protocolCurrent}` : '—'}
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
            proofStatus={glyphStatus(quorumsQ.proofState)}
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
                {quorumsQ.data ? quorums.length : '—'}
              </Text>
            }
            footnote="signing this height"
          />
        </SimpleGrid>
      </Box>

      {/* Top proposers */}
      <Box as="section">
        <SectionHeading
          label={`Top proposers · epoch ${epoch ? `#${epoch.index}` : '—'}`}
          action={
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
          }
        />
        {epochQ.isLoading || evonodesQ.isLoading ? (
          <VStack align="stretch" spacing={2}>
            <Text fontSize="xs" color="muted">
              Reading every evonode&apos;s block count before ranking…
            </Text>
            <LoadingCard lines={5} />
          </VStack>
        ) : epochQ.isError || evonodesQ.isError ? (
          <Text fontSize="sm" color="failed" fontFamily="mono">
            Proposers unavailable:{' '}
            {epochQ.isError ? 'the current epoch is unknown' : evonodesQ.error?.message ?? 'request failed'}
          </Text>
        ) : (
          <VStack align="stretch" spacing={2}>
            <WalkCapNotice data={evonodesQ.data} what="proposers" />
            <EvonodesLeaderboard entries={proposers.bars} limit={10} />
          </VStack>
        )}
      </Box>

      <Grid templateColumns={{ base: '1fr', lg: '3fr 2fr' }} gap={{ base: 8, lg: 10 }}>
        <Box as="section">
          <SectionHeading label="Quick actions" />
          <SimpleGrid columns={{ base: 1, md: 2 }} spacingX={6} spacingY={4}>
            {QUICK_ACTIONS.map((a) => (
              <LookupInput
                key={a.label}
                label={a.label}
                placeholder={a.placeholder}
                validate={a.validate}
                buildHref={a.buildHref}
              />
            ))}
          </SimpleGrid>
        </Box>

        <Box as="section">
          <SectionHeading
            label="Quorums by type"
            action={
              <Button
                as={NextLink}
                href="/network/quorums/"
                size="xs"
                variant="ghost"
                color="accent"
                fontFamily="mono"
                fontSize="11px"
              >
                all quorums →
              </Button>
            }
          />
          {quorumsQ.isLoading ? (
            <LoadingCard lines={2} />
          ) : quorumsQ.isError ? (
            <Text fontSize="sm" color="failed" fontFamily="mono">
              Quorums unavailable: {quorumsQ.error?.message ?? 'request failed'}
            </Text>
          ) : (
            <QuorumBreakdownList groups={quorumGroups} />
          )}
        </Box>
      </Grid>

      {/* Bottom grid */}
      <Grid templateColumns={{ base: '1fr', lg: '3fr 2fr' }} gap={{ base: 8, lg: 10 }}>
        <Box as="section">
          <SectionHeading
            label="Vote polls ending soon"
            action={
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
            }
          />
          {pollsQ.isLoading ? (
            <LoadingCard lines={3} />
          ) : polls.length === 0 ? (
            <Text color="muted" fontSize="sm" fontFamily="mono">
              No polls ending in the next 30 days.
            </Text>
          ) : (
            <VotePollsList entries={polls.slice(0, 10)} />
          )}
        </Box>

        <Box as="section">
          <SectionHeading label="Well-known contracts" />
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
        </Box>
      </Grid>

      <Text fontSize="xs" color="muted" textAlign="center" fontFamily="mono">
        {chainId ?? '—'}
      </Text>
    </VStack>
  );
}
