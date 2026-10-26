'use client';

import { useEffect, useReducer, useState } from 'react';
import NextLink from 'next/link';
import {
  Button,
  Heading,
  HStack,
  Select,
  Switch,
  Text,
  useDisclosure,
  VStack,
} from '@chakra-ui/react';
import { Container } from '@ui/Container';
import { InfoBlock } from '@ui/InfoBlock';
import { InfoLine } from '@components/data/InfoLine';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import { useSdk } from '@sdk/hooks';
import { useQueryProofStore } from '@/contexts/QueryProofStore';
import {
  DEFAULT_NETWORK,
  getAvailableNetworks,
  isBuiltInNetwork,
  removeCustomDevnet,
} from '@sdk/networks';
import { CustomDevnetModal } from '@components/layout/CustomDevnetModal';
import { ConnectionSettingsForm } from '@components/settings/ConnectionSettingsForm';
import { getQuorumKeySource } from '@sdk/proofs';
import { useProtocolVersionCheck } from '@sdk/version';
import { EVO_SDK_VERSION } from '@/version';
import { useViewedIdentities } from '@hooks/useViewedIdentities';

const DIAG_KEY = 'npe:diagnosticsEnabled';

function useLocalStorageBool(key: string, fallback: boolean) {
  // Initial state must match SSR output (no localStorage). The useEffect below
  // pulls the real stored value on mount.
  const [val, setVal] = useState<boolean>(fallback);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = window.localStorage.getItem(key);
    if (raw === 'true') setVal(true);
    else if (raw === 'false') setVal(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return [
    val,
    (next: boolean) => {
      if (typeof window !== 'undefined') window.localStorage.setItem(key, String(next));
      setVal(next);
    },
  ] as const;
}

export default function Page() {
  usePageBreadcrumbs([{ label: 'Home', href: '/' }, { label: 'Settings' }]);
  const { network, setNetwork, reconnect, status, error, quorumUrl } = useSdk();
  const protocol = useProtocolVersionCheck();
  const { enabled: inspectorEnabled, setEnabled: setInspectorEnabled } = useQueryProofStore();
  const [diagEnabled, setDiagEnabled] = useLocalStorageBool(DIAG_KEY, true);
  const viewed = useViewedIdentities();
  const modal = useDisclosure();
  // Force re-read of the registry after add/remove (mutations are out-of-state).
  const [, bump] = useReducer((n: number) => n + 1, 0);

  const all = getAvailableNetworks();
  const customDevnets = all.filter((n) => n.type === 'devnet' && !isBuiltInNetwork(n.name));

  const handleRemove = (name: string) => {
    if (name === network) setNetwork(DEFAULT_NETWORK);
    removeCustomDevnet(name);
    bump();
  };

  return (
    <Container py={{ base: 4, md: 6 }}>
      <VStack align="stretch" spacing={4}>
        <InfoBlock emphasised>
          <Heading size="md" color="gray.100">
            Settings
          </Heading>
        </InfoBlock>

        <InfoBlock>
          <VStack align="stretch" spacing={4}>
            <Heading size="sm" color="gray.100">
              Network
            </Heading>
            <Select
              aria-label="Active network"
              size="sm"
              value={network}
              onChange={(e) => setNetwork(e.target.value)}
              bg="gray.800"
              borderColor="gray.700"
              maxW="sm"
            >
              {all.map((n) => (
                <option key={n.name} value={n.name}>
                  {n.label || n.name}
                </option>
              ))}
            </Select>
            <HStack>
              <Button size="sm" variant="outline" onClick={reconnect}>
                Reconnect
              </Button>
              <Text fontSize="xs" color="gray.400">
                SDK status: {status}
              </Text>
            </HStack>
            {status === 'error' && error ? (
              <Text fontSize="xs" color="failed" fontFamily="mono" wordBreak="break-word">
                {error.message}
              </Text>
            ) : null}
          </VStack>
        </InfoBlock>

        <InfoBlock id="connection" scrollMarginTop="96px">
          <VStack align="stretch" spacing={3}>
            <Heading size="sm" color="gray.100">
              Connection
            </Heading>
            <Text fontSize="sm" color="gray.250">
              The SDK first fetches quorum public keys and the masternode list from a
              trusted quorum service, then sends each query to DAPI nodes from that list.
              If Platform is unreachable from this browser, try another quorum service or
              longer timeouts.
            </Text>
            <ConnectionSettingsForm />
          </VStack>
        </InfoBlock>

        <InfoBlock>
          <VStack align="stretch" spacing={3}>
            <Heading size="sm" color="gray.100">
              Custom devnets
            </Heading>
            <Text fontSize="sm" color="gray.250">
              Devnets you&apos;ve added are stored in this browser only. They share testnet
              derivation paths. Each devnet needs a reachable quorums service (default:
              <code> https://quorums.&lt;name&gt;.networks.dash.org</code>) for quorum keys
              and its masternode list; saved DAPI addresses are used only when that service
              publishes no masternodes.
            </Text>
            {customDevnets.length === 0 ? (
              <Text fontSize="sm" color="gray.400">
                No custom devnets saved.
              </Text>
            ) : (
              <VStack align="stretch" spacing={2}>
                {customDevnets.map((n) => (
                  <HStack key={n.name} justify="space-between">
                    <VStack align="start" spacing={0}>
                      <Text fontSize="sm" fontFamily="mono" color="gray.100">
                        {n.name}
                      </Text>
                      <Text fontSize="xs" color="gray.400">
                        {n.dapiAddresses?.length
                          ? `${n.dapiAddresses.length} DAPI address${n.dapiAddresses.length === 1 ? '' : 'es'}`
                          : 'no DAPI addresses'}
                        {n.quorumUrl ? ' · custom quorum URL' : null}
                      </Text>
                    </VStack>
                    <Button
                      size="xs"
                      variant="outline"
                      borderColor="gray.700"
                      color="red.300"
                      _hover={{ borderColor: 'red.400', color: 'red.200' }}
                      onClick={() => handleRemove(n.name)}
                    >
                      Remove
                    </Button>
                  </HStack>
                ))}
              </VStack>
            )}
            <HStack>
              <Button size="sm" variant="outline" onClick={modal.onOpen}>
                Add custom devnet…
              </Button>
            </HStack>
          </VStack>
        </InfoBlock>

        <InfoBlock>
          <VStack align="stretch" spacing={3}>
            <Heading size="sm" color="gray.100">
              Proof verification
            </Heading>
            <Text fontSize="sm" color="gray.250">
              Always on. Proof-capable queries are verified by the WASM SDK in your browser
              against quorum keys from the trusted quorum service. Earlier builds offered an
              untrusted mode; the bundled SDK cannot run queries without these keys (every
              proof-capable query failed with &ldquo;Non-trusted mode is not supported in
              WASM&rdquo;), so it was removed.
            </Text>
          </VStack>
        </InfoBlock>

        <InfoBlock>
          <VStack align="stretch" spacing={3}>
            <Heading size="sm" color="gray.100">
              Query Inspector
            </Heading>
            <Text fontSize="sm" color="gray.250">
              Captures proof data from every SDK query and displays it in an
              educational drawer. Open with <kbd>⌘⇧P</kbd> on macOS or <kbd>Ctrl+Shift+P</kbd>,
              or click the query count in the footer.
            </Text>
            <HStack>
              <Switch
                aria-label="Query Inspector"
                isChecked={inspectorEnabled}
                onChange={(e) => setInspectorEnabled(e.target.checked)}
                colorScheme="blue"
              />
              <Text fontSize="sm" color="gray.250">
                {inspectorEnabled ? 'Enabled' : 'Disabled'}
              </Text>
            </HStack>
          </VStack>
        </InfoBlock>

        <InfoBlock>
          <VStack align="stretch" spacing={3}>
            <Heading size="sm" color="gray.100">
              Diagnostics log
            </Heading>
            <Text fontSize="sm" color="gray.250">
              Keep a session-only ring buffer of SDK queries. Useful for debugging,
              not required. Open with <kbd>⌘/</kbd> on macOS or <kbd>Ctrl+/</kbd>.
            </Text>
            <HStack>
              <Switch
                aria-label="Diagnostics log"
                isChecked={diagEnabled}
                onChange={(e) => setDiagEnabled(e.target.checked)}
                colorScheme="blue"
              />
              <Text fontSize="sm" color="gray.250">
                {diagEnabled ? 'Enabled' : 'Disabled'}
              </Text>
            </HStack>
          </VStack>
        </InfoBlock>

        <InfoBlock>
          <VStack align="stretch" spacing={3}>
            <Heading size="sm" color="gray.100">Local exploration history</Heading>
            <Text fontSize="sm" color="gray.250">
              Remember viewed identities in this browser to seed identity lookups.
              Turning this off erases that history. Explicitly saved items are managed separately.
            </Text>
            <HStack>
              <Switch
                aria-label="Remember viewed identities"
                isChecked={viewed.consent}
                onChange={(e) => viewed.setConsent(e.target.checked)}
                colorScheme="blue"
              />
              <Text fontSize="sm" color="gray.250">{viewed.ids.length} remembered {viewed.ids.length === 1 ? 'identity' : 'identities'}</Text>
            </HStack>
            {viewed.error ? <Text role="alert" fontSize="sm" color="failed">{viewed.error.message}</Text> : null}
            <HStack flexWrap="wrap">
              <Button size="sm" variant="outline" onClick={viewed.clear} isDisabled={viewed.ids.length === 0}>
                Clear viewed identities
              </Button>
              <Button as={NextLink} href="/saved/" size="sm" variant="ghost">Manage saved items</Button>
            </HStack>
          </VStack>
        </InfoBlock>

        <InfoBlock>
          <VStack align="stretch" spacing={3}>
            <Heading size="sm" color="gray.100">
              Build info
            </Heading>
            <InfoLine label="Network" value={<Text fontFamily="mono">{network}</Text>} />
            <InfoLine label="SDK package" value={<Text fontFamily="mono">@dashevo/evo-sdk {EVO_SDK_VERSION}</Text>} />
            <InfoLine
              label="Protocol version"
              value={
                <Text fontFamily="mono" color={protocol.mismatch ? 'warning' : undefined}>
                  SDK v{protocol.sdkVersion ?? '—'} · network v{protocol.networkVersion ?? '—'}
                </Text>
              }
            />
            <InfoLine
              label="Quorum keys from"
              value={<Text fontFamily="mono" wordBreak="break-all">{getQuorumKeySource(network, quorumUrl)}</Text>}
            />
          </VStack>
        </InfoBlock>
      </VStack>

      <CustomDevnetModal
        isOpen={modal.isOpen}
        onClose={modal.onClose}
        onSaved={(name) => {
          bump();
          setNetwork(name);
        }}
      />
    </Container>
  );
}
