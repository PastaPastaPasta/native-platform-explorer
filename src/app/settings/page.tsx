'use client';

import { useState } from 'react';
import {
  Button,
  Heading,
  HStack,
  Radio,
  RadioGroup,
  Stack,
  Switch,
  Text,
  VStack,
} from '@chakra-ui/react';
import { Container } from '@ui/Container';
import { InfoBlock } from '@ui/InfoBlock';
import { InfoLine } from '@components/data/InfoLine';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import { useSdk } from '@sdk/hooks';
import type { Network } from '@sdk/networks';

const DIAG_KEY = 'npe:diagnosticsEnabled';

function useLocalStorageBool(key: string, fallback: boolean) {
  const [val, setVal] = useState<boolean>(() => {
    if (typeof window === 'undefined') return fallback;
    const raw = window.localStorage.getItem(key);
    return raw === 'true' ? true : raw === 'false' ? false : fallback;
  });
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
  const [diagEnabled, setDiagEnabled] = useLocalStorageBool(DIAG_KEY, false);

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
            <RadioGroup
              value={network}
              onChange={(next) => setNetwork(next as Network)}
              colorScheme="blue"
            >
              <Stack direction="row" spacing={6}>
                <Radio value="testnet">Testnet</Radio>
                <Radio value="mainnet">Mainnet</Radio>
              </Stack>
            </RadioGroup>
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
    </Container>
  );
}
