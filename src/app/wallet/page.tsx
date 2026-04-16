'use client';

import { useState } from 'react';
import {
  Button,
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
import { createExtensionSigner, detectExtension } from '@/signer/extension';
import { createMnemonicSigner } from '@/signer/mnemonic';
import { createWifSigner } from '@/signer/wif';
import { getConfig } from '@/config';
import { isBase58Identifier } from '@util/identifier';

function SafetyBanner() {
  return (
    <InfoBlock>
      <Text fontSize="sm" color="gray.250">
        The explorer never stores your keys. Mnemonic / WIF inputs live only in this
        tab&apos;s memory and are cleared on disconnect, navigation, inactivity
        (&gt; 10 minutes hidden), or reload.
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
          You were previously connected via <strong>{stash.kind}</strong> as
          identity <code>{stash.identityId}</code>. Key material was cleared on
          reload — reconnect below to sign again.
        </Text>
        <Button size="xs" variant="ghost" onClick={clearStash}>
          Dismiss
        </Button>
      </HStack>
    </InfoBlock>
  );
}

function ExtensionPane() {
  const { connect } = useSigner();
  const [error, setError] = useState<Error | null>(null);
  const [busy, setBusy] = useState(false);

  const onConnect = async () => {
    setBusy(true);
    setError(null);
    try {
      const present = await detectExtension();
      if (!present) throw new Error('Dash Platform Extension not detected in this browser.');
      const signer = await createExtensionSigner();
      connect(signer);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <VStack align="stretch" spacing={3}>
      <Text fontSize="sm" color="gray.250">
        Delegates signing to the Dash Platform Extension. The extension prompts you
        to approve each signature; no key material ever leaves it.
      </Text>
      <HStack>
        <Button size="sm" colorScheme="blue" onClick={onConnect} isLoading={busy}>
          Connect extension
        </Button>
      </HStack>
      {error ? <ErrorCard error={error} /> : null}
    </VStack>
  );
}

function MnemonicPane() {
  const { connect } = useSigner();
  const { sdk, network } = useSdk();
  const [identityId, setIdentityId] = useState('');
  const [mnemonic, setMnemonic] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const onConnect = async () => {
    if (!sdk) {
      setError(new Error('SDK not ready.'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const signer = await createMnemonicSigner(sdk, mnemonic.trim(), identityId.trim(), network);
      setMnemonic(''); // blank the controlled input once the signer captured the seed
      connect(signer);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <VStack align="stretch" spacing={3}>
      <Text fontSize="sm" color="gray.250">
        Paste a BIP-39 mnemonic and the identity ID it controls. The seed lives only
        in this tab&apos;s memory. We use DIP-13 account 0 by default.
      </Text>
      <Input
        size="sm"
        placeholder="Identity ID"
        value={identityId}
        onChange={(e) => setIdentityId(e.target.value)}
        fontFamily="mono"
        bg="gray.800"
        borderColor="gray.700"
      />
      <Textarea
        size="sm"
        placeholder="twelve or twenty-four words …"
        value={mnemonic}
        onChange={(e) => setMnemonic(e.target.value)}
        fontFamily="mono"
        bg="gray.800"
        borderColor="gray.700"
      />
      <HStack>
        <Button
          size="sm"
          colorScheme="blue"
          onClick={() => void onConnect()}
          isLoading={busy}
          isDisabled={!isBase58Identifier(identityId.trim()) || mnemonic.trim().split(/\s+/).length < 12}
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
  const { sdk } = useSdk();
  const [identityId, setIdentityId] = useState('');
  const [wif, setWif] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const onConnect = async () => {
    if (!sdk) {
      setError(new Error('SDK not ready.'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const signer = await createWifSigner(sdk, wif.trim(), identityId.trim());
      setWif('');
      connect(signer);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <VStack align="stretch" spacing={3}>
      <Text fontSize="sm" color="gray.250">
        Paste a single WIF-encoded private key plus the identity ID it controls. For
        one-off operations only; treat it like a burn credential.
      </Text>
      <Input
        size="sm"
        placeholder="Identity ID"
        value={identityId}
        onChange={(e) => setIdentityId(e.target.value)}
        fontFamily="mono"
        bg="gray.800"
        borderColor="gray.700"
      />
      <Input
        size="sm"
        placeholder="WIF"
        value={wif}
        onChange={(e) => setWif(e.target.value)}
        fontFamily="mono"
        bg="gray.800"
        borderColor="gray.700"
        type="password"
      />
      <HStack>
        <Button
          size="sm"
          colorScheme="blue"
          onClick={() => void onConnect()}
          isLoading={busy}
          isDisabled={!isBase58Identifier(identityId.trim()) || wif.trim().length === 0}
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
            Connect a signer so the broadcast console can sign state transitions on
            your behalf.
          </Text>
        </InfoBlock>

        <SignerStatusCard />
        <ReconnectHint />
        <SafetyBanner />

        <InfoBlock>
          <Tabs variant="soft-rounded" colorScheme="blue">
            <TabList flexWrap="wrap" gap={2} borderBottom="none">
              <Tab fontSize="sm">Extension</Tab>
              <Tab fontSize="sm">Mnemonic</Tab>
              <Tab fontSize="sm">WIF</Tab>
            </TabList>
            <TabPanels>
              <TabPanel px={0}><ExtensionPane /></TabPanel>
              <TabPanel px={0}><MnemonicPane /></TabPanel>
              <TabPanel px={0}><WifPane /></TabPanel>
            </TabPanels>
          </Tabs>
        </InfoBlock>
      </VStack>
    </Container>
  );
}
