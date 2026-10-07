'use client';

import { useState } from 'react';
import {
  Button,
  FormControl,
  FormLabel,
  Heading,
  HStack,
  Input,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Text,
  Textarea,
  VStack,
} from '@chakra-ui/react';
import { Container } from '@ui/Container';
import { InfoBlock } from '@ui/InfoBlock';
import { ErrorCard } from '@ui/ErrorCard';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import { WriteModeDisabled } from '@components/broadcast/WriteModeDisabled';
import { SignerStatusCard } from '@components/broadcast/SignerStatusCard';
import { useSigner } from '@/signer/SignerProvider';
import { useSdk } from '@sdk/hooks';
import { normalizeError } from '@sdk/errors';
import { getDerivationNetwork } from '@sdk/networks';
import { BridgeImportPane } from '@components/wallet/BridgeImportPane';
import { BridgeLaunchCard } from '@components/wallet/BridgeLaunchCard';
import { getConfig } from '@/config';
import { isBase58Identifier } from '@util/identifier';

function SafetyBanner() {
  return (
    <InfoBlock>
      <Text fontSize="sm" color="gray.250">
        The explorer never persists your keys. Imported keys stay in this tab&apos;s memory.
        Disconnect, inactivity (&gt; 10 minutes hidden), or reload clears the local signer.
        An operation already in progress can retain signing material until it finishes.
        Mnemonic and WIF fields are cleared after each connection attempt. JavaScript cannot
        guarantee that every copy of a secret is erased from memory.
      </Text>
    </InfoBlock>
  );
}

function ReconnectHint() {
  const { signer, stash, clearStash } = useSigner();
  if (signer || !stash) return null;
  return (
    <InfoBlock>
      <HStack justify="space-between" flexWrap="wrap" spacing={3}>
        <Text fontSize="sm" color="gray.250">
          You were previously connected via <strong>{stash.kind}</strong> as identity{' '}
          <code>{stash.identityId}</code>. Key material was cleared on reload — reconnect below to
          sign again.
        </Text>
        <Button size="xs" variant="ghost" onClick={clearStash}>
          Dismiss
        </Button>
      </HStack>
    </InfoBlock>
  );
}

function ExtensionPane() {
  return (
    <Text fontSize="sm" color="gray.250" role="status">
      Extension signing is unavailable for SDK operations in this explorer. Use a bridge backup,
      mnemonic, or WIF signer whose private keys match enabled on-chain identity keys.
    </Text>
  );
}

function MnemonicPane() {
  const { connect } = useSigner();
  const { sdk, network, status } = useSdk();
  const [identityId, setIdentityId] = useState('');
  const [mnemonic, setMnemonic] = useState('');
  const [path, setPath] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const onConnect = async () => {
    if (!sdk || status !== 'ready') {
      setMnemonic('');
      setError(new Error('SDK not ready.'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { createMnemonicSigner } = await import('@/signer/mnemonic');
      const signer = await createMnemonicSigner(
        sdk,
        mnemonic.trim(),
        identityId.trim(),
        getDerivationNetwork(network),
        0,
        path.trim() || undefined,
      );
      connect(signer);
    } catch (e) {
      setError(normalizeError(e));
    } finally {
      setMnemonic('');
      setBusy(false);
    }
  };

  return (
    <VStack align="stretch" spacing={3}>
      <Text fontSize="sm" color="gray.250">
        Paste a BIP-39 mnemonic and the identity ID it controls. The seed lives only in this
        tab&apos;s memory. We use DIP-13 account 0 by default; enter the exact path used by your
        wallet if it differs. The derived key must match an enabled on-chain key.
      </Text>
      <FormControl isRequired>
        <FormLabel fontSize="sm">Identity ID</FormLabel>
        <Input
          aria-label="Identity ID"
          size="sm"
          placeholder="Identity ID"
          value={identityId}
          onChange={(e) => setIdentityId(e.target.value)}
          fontFamily="mono"
          bg="gray.800"
          borderColor="gray.700"
        />
      </FormControl>
      <FormControl isRequired>
        <FormLabel fontSize="sm">Mnemonic</FormLabel>
        <Textarea
          aria-label="Mnemonic"
          autoComplete="off"
          spellCheck={false}
          isDisabled={busy}
          size="sm"
          placeholder="twelve or twenty-four words …"
          value={mnemonic}
          onChange={(e) => setMnemonic(e.target.value)}
          fontFamily="mono"
          bg="gray.800"
          borderColor="gray.700"
        />
      </FormControl>
      <FormControl>
        <FormLabel fontSize="sm">Derivation path (optional)</FormLabel>
        <Input
          aria-label="Derivation path"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="Default: DIP-13 account 0"
          isDisabled={busy}
          fontFamily="mono"
        />
      </FormControl>
      <HStack>
        <Button
          size="sm"
          colorScheme="blue"
          onClick={() => void onConnect()}
          isLoading={busy}
          isDisabled={
            !sdk ||
            status !== 'ready' ||
            !isBase58Identifier(identityId.trim()) ||
            mnemonic.trim().split(/\s+/).length < 12
          }
        >
          Connect mnemonic
        </Button>
      </HStack>
      {error ? <ErrorCard error={error} /> : null}
    </VStack>
  );
}

function WifPane() {
  const { connect } = useSigner();
  const { sdk, status } = useSdk();
  const [identityId, setIdentityId] = useState('');
  const [wif, setWif] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const onConnect = async () => {
    if (!sdk || status !== 'ready') {
      setWif('');
      setError(new Error('SDK not ready.'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { createWifSigner } = await import('@/signer/wif');
      const signer = await createWifSigner(sdk, wif.trim(), identityId.trim());
      connect(signer);
    } catch (e) {
      setError(normalizeError(e));
    } finally {
      setWif('');
      setBusy(false);
    }
  };

  return (
    <VStack align="stretch" spacing={3}>
      <Text fontSize="sm" color="gray.250">
        Paste a single WIF-encoded private key plus the identity ID it controls. For one-off
        operations only; treat it like a burn credential.
      </Text>
      <FormControl isRequired>
        <FormLabel fontSize="sm">Identity ID</FormLabel>
        <Input
          aria-label="Identity ID"
          size="sm"
          placeholder="Identity ID"
          value={identityId}
          onChange={(e) => setIdentityId(e.target.value)}
          fontFamily="mono"
          bg="gray.800"
          borderColor="gray.700"
        />
      </FormControl>
      <FormControl isRequired>
        <FormLabel fontSize="sm">WIF private key</FormLabel>
        <Input
          aria-label="WIF private key"
          autoComplete="off"
          spellCheck={false}
          isDisabled={busy}
          size="sm"
          placeholder="WIF"
          value={wif}
          onChange={(e) => setWif(e.target.value)}
          fontFamily="mono"
          bg="gray.800"
          borderColor="gray.700"
          type="password"
        />
      </FormControl>
      <HStack>
        <Button
          size="sm"
          colorScheme="blue"
          onClick={() => void onConnect()}
          isLoading={busy}
          isDisabled={
            !sdk ||
            status !== 'ready' ||
            !isBase58Identifier(identityId.trim()) ||
            wif.trim().length === 0
          }
        >
          Connect WIF
        </Button>
      </HStack>
      {error ? <ErrorCard error={error} /> : null}
    </VStack>
  );
}

export default function Page() {
  usePageBreadcrumbs([{ label: 'Home', href: '/' }, { label: 'Wallet' }]);
  const config = getConfig();

  if (config.disableWriteMode) {
    return <WriteModeDisabled context="wallet" />;
  }

  return (
    <Container py={{ base: 4, md: 6 }}>
      <VStack align="stretch" spacing={4}>
        <InfoBlock emphasised>
          <Heading size="md" color="gray.100">
            Wallet
          </Heading>
          <Text fontSize="sm" color="gray.250" mt={1}>
            Connect a signer so the broadcast console can sign state transitions on your behalf.
          </Text>
        </InfoBlock>

        <SignerStatusCard />
        <ReconnectHint />
        <SafetyBanner />

        <InfoBlock>
          <Tabs variant="soft-rounded" colorScheme="blue">
            <TabList flexWrap="wrap" gap={2} borderBottom="none">
              <Tab fontSize="sm">Bridge backup</Tab>
              <Tab fontSize="sm">Extension</Tab>
              <Tab fontSize="sm">Mnemonic</Tab>
              <Tab fontSize="sm">WIF</Tab>
            </TabList>
            <TabPanels>
              <TabPanel px={0}>
                <BridgeImportPane />
              </TabPanel>
              <TabPanel px={0}>
                <ExtensionPane />
              </TabPanel>
              <TabPanel px={0}>
                <MnemonicPane />
              </TabPanel>
              <TabPanel px={0}>
                <WifPane />
              </TabPanel>
            </TabPanels>
          </Tabs>
        </InfoBlock>

        <BridgeLaunchCard />
      </VStack>
    </Container>
  );
}
