'use client';

import { useEffect, useState } from 'react';
import NextLink from 'next/link';
import { Box, Button, CloseButton, Heading, HStack, Text, VStack } from '@chakra-ui/react';
import { InfoBlock } from '@ui/InfoBlock';
import { useSdk } from '@sdk/hooks';
import { SdkSessionError, type SdkSessionFailure } from '@sdk/errors';
import { getNetwork, isBuiltInNetwork } from '@sdk/networks';
import { getQuorumKeySource } from '@sdk/proofs';
import { useProtocolVersionCheck } from '@sdk/version';
import { EVO_SDK_VERSION } from '@/version';

const COPY: Record<SdkSessionFailure, { title: string; body: string }> = {
  'unknown-network': {
    title: 'Unknown network',
    body: 'This link or saved preference names a network this explorer does not know. Choose a configured network.',
  },
  timeout: {
    title: 'Dash Platform did not respond',
    body: 'The SDK could not finish connecting in time. Data on this page cannot be loaded or verified until it does.',
  },
  unreachable: {
    title: 'Cannot reach Dash Platform',
    body: 'Dash Platform could not be reached from this browser: the trusted quorum service or every DAPI endpoint failed. Data on this page cannot be loaded or verified until it is reachable.',
  },
  failed: {
    title: 'The SDK could not start',
    body: 'The explorer could not create an SDK session for this network.',
  },
};

/** Page-level state for a failed SDK session (PRD §11.7). Rendered above the
 *  page instead of replacing it: settings, saved items and local tools still
 *  work, and each SDK-backed card reports the same failure. */
export function SdkSessionNotice() {
  const { status, error: sessionError, unreachable, network, reconnect } = useSdk();
  const error = status === 'error' ? sessionError : unreachable;
  if (!error) return null;
  const reason: SdkSessionFailure = error instanceof SdkSessionError ? error.reason : 'failed';
  const copy = COPY[reason];
  const cfg = getNetwork(network);
  const label = cfg.label || network;
  // Devnets saved before sessions were always trusted may hold only DAPI
  // addresses; they now depend on the quorum service derived from the name.
  const derivedDevnetQuorum = (reason === 'timeout' || reason === 'unreachable') && cfg.type === 'devnet' && !cfg.quorumUrl && !isBuiltInNetwork(network);
  return (
    <InfoBlock role="alert" aria-live="assertive" borderColor="failed" mb={4}>
      <VStack align="flex-start" spacing={3}>
        <Heading as="h2" size="sm" color="failed">
          {copy.title}
          {reason !== 'unknown-network' ? ` (${label})` : null}
        </Heading>
        <Text color="muted" fontSize="sm" maxW="70ch">{copy.body}</Text>
        {derivedDevnetQuorum ? (
          <Text color="muted" fontSize="sm" maxW="70ch">
            This devnet has no quorum service URL saved, so the explorer used{' '}
            <Text as="span" fontFamily="mono">{getQuorumKeySource(network)}</Text>. Every session now
            verifies proofs with a quorum service; DAPI addresses alone cannot connect. If the devnet runs
            its service elsewhere, remove it and add it again with that quorum service URL.
          </Text>
        ) : null}
        <Text fontSize="xs" fontFamily="mono" color="muted" wordBreak="break-word">{error.message}</Text>
        <HStack spacing={2} flexWrap="wrap">
          {reason !== 'unknown-network' ? (
            <Button size="sm" variant="outline" borderColor="hairlineStrong" color="ink" onClick={reconnect}>
              Retry connection
            </Button>
          ) : null}
          <Button as={NextLink} href="/settings/#connection" size="sm" variant="ghost">
            {reason === 'unknown-network' ? 'Choose a network' : 'Try alternate endpoints'}
          </Button>
        </HStack>
      </VStack>
    </InfoBlock>
  );
}

const DISMISS_KEY = 'npe:protocolWarningDismissed';

/** Small, dismissible (per tab session) protocol-version mismatch warning. */
export function SdkVersionNotice() {
  const { network } = useSdk();
  const { sdkVersion, networkVersion, mismatch } = useProtocolVersionCheck();
  const id = `${network}:${sdkVersion}:${networkVersion}`;
  const [dismissed, setDismissed] = useState<string | null>(null);
  useEffect(() => {
    try { setDismissed(window.sessionStorage.getItem(DISMISS_KEY)); } catch { /* optional */ }
  }, []);
  if (!mismatch || dismissed === id) return null;
  const newer = (networkVersion ?? 0) > (sdkVersion ?? 0);
  return (
    <Box role="status" mb={3} px={3} py={2} borderWidth="1px" borderColor="warning" borderRadius="md">
      <HStack justify="space-between" align="flex-start" spacing={3}>
        <Text fontSize="xs" color="muted">
          <Text as="span" color="warning" fontWeight={600}>Protocol version mismatch: </Text>
          {getNetwork(network).label || network} runs Platform protocol v{networkVersion}; the bundled
          SDK (@dashevo/evo-sdk {EVO_SDK_VERSION}) speaks v{sdkVersion}.{' '}
          {newer
            ? 'The explorer still works, but data added by newer protocol features may fail to load.'
            : 'The explorer still works, but some responses may fail to decode.'}
        </Text>
        <CloseButton
          size="sm"
          aria-label="Dismiss protocol version warning"
          onClick={() => {
            try { window.sessionStorage.setItem(DISMISS_KEY, id); } catch { /* optional */ }
            setDismissed(id);
          }}
        />
      </HStack>
    </Box>
  );
}
