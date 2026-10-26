'use client';

import { useEffect, useRef, useState } from 'react';
import NextLink from 'next/link';
import { Box, Button, CloseButton, Heading, HStack, Link, Text, VStack } from '@chakra-ui/react';
import { InfoBlock } from '@ui/InfoBlock';
import { useSdk } from '@sdk/hooks';
import { SdkSessionError, type SdkSessionFailure } from '@sdk/errors';
import { derivedQuorumNameError, devnetShortName, getNetwork, isBuiltInNetwork } from '@sdk/networks';
import { getQuorumKeySource } from '@sdk/proofs';
import { useProtocolVersionCheck } from '@sdk/version';
import { EVO_SDK_VERSION } from '@/version';
import { useOnlineStatus } from '@hooks/useOnlineStatus';

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

// navigator.onLine === false explains any connection failure (PRD §14.3).
const OFFLINE_COPY = {
  title: 'You are offline',
  body: 'This browser has no network connection. Pages it has saved still work, but Platform data cannot be loaded or verified until the connection returns. The explorer reconnects when it does.',
};

/** Page-level state for a failed SDK session (PRD §11.7). Rendered above the
 *  page instead of replacing it: settings, saved items and local tools still
 *  work, and each SDK-backed card reports the same failure. */
export function SdkSessionNotice() {
  const { status, error: sessionError, unreachable, network, reconnect } = useSdk();
  const error = status === 'error' ? sessionError : unreachable;
  const reason: SdkSessionFailure = error instanceof SdkSessionError ? error.reason : 'failed';
  const online = useOnlineStatus();
  const wasOnline = useRef(online);
  useEffect(() => {
    const cameBack = online && !wasOnline.current;
    wasOnline.current = online;
    if (cameBack && error && reason !== 'unknown-network') reconnect();
  }, [online, error, reason, reconnect]);
  if (!error) return null;
  const offline = !online && reason !== 'unknown-network';
  const copy = offline ? OFFLINE_COPY : COPY[reason];
  const cfg = getNetwork(network);
  const label = cfg.label || network;
  // A failed connect means the quorum prefetch failed. For a custom devnet
  // without a saved quorum URL (e.g. one saved with only DAPI addresses) that
  // is the service derived from its name.
  const derivedDevnetQuorum = !offline && status === 'error' && (reason === 'timeout' || reason === 'unreachable')
    && cfg.type === 'devnet' && !cfg.quorumUrl && !isBuiltInNetwork(network);
  const derivedNameError = derivedDevnetQuorum ? derivedQuorumNameError(devnetShortName(cfg)) : null;
  return (
    <InfoBlock role="alert" aria-live="assertive" borderColor="failed" mb={4}>
      <VStack align="flex-start" spacing={3}>
        <Heading as="h2" size="sm" color="failed">
          {copy.title}
          {reason !== 'unknown-network' && !offline ? ` (${label})` : null}
        </Heading>
        <Text color="muted" fontSize="sm" maxW="70ch">{copy.body}</Text>
        {derivedDevnetQuorum ? (
          <Text color="muted" fontSize="sm" maxW="70ch">
            This devnet has no quorum service URL saved, and every session needs one: proofs are verified
            with its quorum keys, and DAPI addresses cannot replace it.{' '}
            {derivedNameError ? <>No default can be derived from its name ({derivedNameError}).</> : <>
              The explorer used the default,{' '}
              <Text as="span" fontFamily="mono">{getQuorumKeySource(network)}</Text>.
            </>}{' '}
            If the devnet runs its service elsewhere, remove it and add it again with that quorum service URL.
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

/** Small, dismissible (per tab session) warning that the network runs a
 *  protocol the SDK session cannot follow: newer than the bundled SDK
 *  supports, or older than the version the session already uses. */
export function SdkVersionNotice() {
  const { network } = useSdk();
  const { sdkVersion, sessionVersion, networkVersion, mismatch } = useProtocolVersionCheck();
  const id = `${network}:${mismatch}:${mismatch === 'network-older' ? sessionVersion : sdkVersion}:${networkVersion}`;
  const [dismissed, setDismissed] = useState<string | null>(null);
  useEffect(() => {
    try { setDismissed(window.sessionStorage.getItem(DISMISS_KEY)); } catch { /* optional */ }
  }, []);
  if (!mismatch || dismissed === id) return null;
  const label = getNetwork(network).label || network;
  return (
    <Box role="status" mb={3} px={3} py={2} borderWidth="1px" borderColor="warning" borderRadius="md">
      <HStack justify="space-between" align="flex-start" spacing={3}>
        <Text fontSize="xs" color="muted">
          <Text as="span" color="warning" fontWeight={600}>Protocol version mismatch: </Text>
          {mismatch === 'network-newer' ? (
            <>
              {label} runs Platform protocol v{networkVersion}; the bundled SDK (@dashevo/evo-sdk{' '}
              {EVO_SDK_VERSION}) supports up to v{sdkVersion}. The explorer still works, but data
              added by newer protocol features may fail to load. Writes are disabled.
            </>
          ) : (
            <>
              {label} runs Platform protocol v{networkVersion}, older than the v{sessionVersion} this
              SDK session uses (@dashevo/evo-sdk {EVO_SDK_VERSION}), and a session cannot step down.
              Reads may fail to decode or verify, and writes are disabled. If the network was reset,{' '}
              <Link as={NextLink} href="/settings/#connection" color="brand.light">clear the SDK cache</Link>.
            </>
          )}
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
