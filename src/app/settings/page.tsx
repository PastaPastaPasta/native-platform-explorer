'use client';

import { useEffect, useReducer, useState } from 'react';
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
  const { network, trusted, setNetwork, setTrusted, reconnect, status } = useSdk();
  const { enabled: inspectorEnabled, setEnabled: setInspectorEnabled } = useQueryProofStore();
  const [diagEnabled, setDiagEnabled] = useLocalStorageBool(DIAG_KEY, false);
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
          </VStack>
        </InfoBlock>

        <InfoBlock>
          <VStack align="stretch" spacing={3}>
            <Heading size="sm" color="gray.100">
              Custom devnets
            </Heading>
            <Text fontSize="sm" color="gray.250">
              Devnets you&apos;ve added are stored in this browser only. They use testnet
              derivation paths and custom DAPI addresses. Proof verification is disabled
              because their quorum sets are not known to the built-in trusted context.
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
                        {n.dapiAddresses?.length ?? 0} DAPI address
                        {n.dapiAddresses?.length === 1 ? '' : 'es'}
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
              Trusted mode
            </Heading>
            <Text fontSize="sm" color="gray.250">
              When on, every query requests a cryptographic proof and the WASM SDK
              verifies it in your browser. When off, responses are returned without
              verification — faster, but the explorer cannot tell you they weren&apos;t
              tampered with.
            </Text>
            <HStack>
              <Switch
                isChecked={trusted}
                onChange={(e) => {
                  const next = e.target.checked;
                  if (!next) {
                    if (
                      !window.confirm(
                        'Disable trusted mode? Responses will no longer be proof-verified until you re-enable it.',
                      )
                    ) {
                      return;
                    }
                  }
                  setTrusted(next);
                }}
                colorScheme="blue"
              />
              <Text fontSize="sm" color={trusted ? 'success' : 'warning'}>
                {trusted ? 'On (proofs verified)' : 'Off (unverified)'}
              </Text>
            </HStack>
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
            <Heading size="sm" color="gray.100">
              Build info
            </Heading>
            <InfoLine label="Network" value={<Text fontFamily="mono">{network}</Text>} />
            <InfoLine
              label="Trusted mode"
              value={<Text fontFamily="mono">{String(trusted)}</Text>}
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
