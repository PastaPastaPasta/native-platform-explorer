'use client';

import { useEffect, useState } from 'react';
import NextLink from 'next/link';
import { Container } from '@ui/Container';
import { InfoBlock } from '@ui/InfoBlock';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import { Badge, Box, Code, Heading, Link, ListItem, OrderedList, Text } from '@chakra-ui/react';
import { EVO_SDK_VERSION, GIT_COMMIT } from '@/version';
import { usePageTitle } from '@hooks/usePageTitle';

const REPOSITORY = 'https://github.com/PastaPastaPasta/native-platform-explorer';
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? '').replace(/\/+$/, '');

/** How to rebuild this deployment and compare it with what the server sends. */
function VerifyBuild() {
  // The deployment URL is only known in the browser; render a placeholder in
  // the static HTML so hydration matches.
  const [site, setSite] = useState('<this site>/');
  useEffect(() => setSite(`${window.location.origin}${basePath}/`), []);
  const commit = GIT_COMMIT || '<commit>';
  return (
    <>
      <Heading as="h2" size="md" color="gray.100" mt={6} mb={2} id="verify">
        Verify this build
      </Heading>
      <Text color="gray.250" mb={3}>
        This site was built from commit{' '}
        {GIT_COMMIT ? (
          <Link href={`${REPOSITORY}/commit/${GIT_COMMIT}`} isExternal color="brand.light" fontFamily="mono">
            {GIT_COMMIT.slice(0, 12)}
          </Link>
        ) : <code>unknown</code>}
        . Every deployment publishes{' '}
        <Link href={`${basePath}/integrity.json`} isExternal color="brand.light">
          <code>integrity.json</code>
        </Link>
        : the SHA-256 of every file it serves, plus the commit, build settings and toolchain. Builds
        are reproducible, so anyone can rebuild that commit and check that the server sends exactly
        the files the public source produces:
      </Text>
      <Code display="block" whiteSpace="pre" overflowX="auto" p={4} mb={3} borderRadius="md" fontSize="xs">
        {[
          `git clone ${REPOSITORY}`,
          'cd native-platform-explorer',
          `git checkout ${commit}`,
          'pnpm install --frozen-lockfile',
          'NEXT_PUBLIC_BRIDGE_URL=https://bridge.dashhq.org pnpm build',
          `pnpm verify:integrity ${site}`,
        ].join('\n')}
      </Code>
      <OrderedList color="gray.250" mb={3} spacing={2}>
        <ListItem>
          Build with the <code>NEXT_PUBLIC_*</code> values the deployed <code>integrity.json</code> lists
          under <code>env</code> (the command above matches this site&apos;s production build), on Linux
          with Node 22 and the pnpm version pinned in <code>package.json</code>.
        </ListItem>
        <ListItem>
          <code>verify:integrity</code> compares your <code>out/integrity.json</code> with the deployed
          one, then downloads every file from the site and hashes what the server actually returns.
          It explains likely causes of a difference, such as another commit or base path.
        </ListItem>
      </OrderedList>
      <Text color="gray.250" mb={3}>
        Each page pins everything it runs: its Content Security Policy lists the SHA-256 of each inline
        script, every script and stylesheet tag carries a Subresource Integrity hash, and the script
        loader carries the hash of every chunk it loads later, including the SDK and its WASM. The
        browser refuses a file that does not match. So once a page&apos;s HTML matches the source, so
        does the code it executes. The check covers what the server returned to you when you ran it;
        it does not prove what other visitors receive. Platform data is a separate question, answered
        by the proofs described above.
      </Text>
      <Text color="gray.250" mb={3}>
        After a first visit, a service worker keeps the explorer&apos;s files so it opens offline. It
        only stores files whose hash matches this build, always fetches pages from the network first,
        and offers a reload when a new version is deployed.
      </Text>
    </>
  );
}

// Static copy, rendered directly without a markdown dependency. Keep it in
// step with docs/PRD.md (proof model, enumeration limits, write mode, privacy).
export default function Page() {
  usePageBreadcrumbs([{ label: 'Home', href: '/' }, { label: 'About' }]);
  usePageTitle('About');
  return (
    <Container py={{ base: 4, md: 6 }}>
      <InfoBlock>
        <Box sx={{ 'h1,h2,h3': { fontFamily: 'heading' } }}>
          <Heading as="h1" size="lg" color="gray.100" mb={4}>
            Native Platform Explorer
          </Heading>

          <Heading as="h2" size="md" color="gray.100" mt={6} mb={2}>
            What this is
          </Heading>
          <Text color="gray.250" mb={3}>
            A client-only block explorer for Dash Platform, powered exclusively by{' '}
            <Link href="https://github.com/dashevo/platform/tree/master/packages/js-evo-sdk" isExternal color="brand.light">
              @dashevo/evo-sdk
            </Link>{' '}
            <Badge ml={1} colorScheme="blue" fontFamily="mono" textTransform="none" verticalAlign="middle">
              v{EVO_SDK_VERSION}
            </Badge>
            . There is no API server, no database, and no indexer behind this site —
            network data is fetched from a masternode&apos;s DAPI endpoint by the WASM
            SDK running in your browser. Proof-capable responses are always
            verified against prefetched quorum public keys.
          </Text>
          <Text color="gray.250" mb={3}>
            It is a deliberate, reduced-scope sibling of{' '}
            <Link href="https://platform-explorer.com" isExternal color="brand.light">
              platform-explorer
            </Link>
            . Because it has no indexer it cannot browse every identity, contract,
            token, block, or transaction. In exchange, it can ship as a single
            static bundle that anyone can host and verify proof-capable responses
            locally. Quorum public keys are supplied by a trusted service.
          </Text>

          <Heading as="h2" size="md" color="gray.100" mt={6} mb={2} id="proofs">
            Proofs
          </Heading>
          <Text color="gray.250" mb={3}>
            Your browser connects directly to DAPI and asks for data. The SDK
            also asks DAPI for a GroveDB Merkle proof; the WASM
            engine then verifies that proof locally against quorum public keys
            fetched when the SDK connected. The browser trusts that service for
            those keys and does not independently validate Dash Core consensus.
            The proof controls show the SDK&apos;s verification outcome separately
            from whether proof bytes were captured. Ordinary trusted SDK calls
            can verify internally without returning those bytes.
          </Text>
          <Text color="gray.250" mb={3}>
            Some reads have no proof: system status, the quorum list (the SDK
            infers each quorum&apos;s type and threshold from its member count, and
            the explorer marks them as inferred), state-transition results, DPNS name
            resolution and availability (<code>dpns.resolveName</code>,{' '}
            <code>dpns.isNameAvailable</code>), the local DPNS name checks, and the DASH/USD rate from Coinbase. Those are
            labeled &quot;No proof&quot;. Network and query errors are shown as
            unavailable; only explicit proof verification errors are labeled as
            failed verification.
          </Text>
          <Text color="gray.250" mb={3}>
            Open a proof control or the Query Inspector to see the query&apos;s
            original retrieval time, network, response height when returned, and
            quorum-key source. Export evidence JSON to save that response and any
            captured proof bytes. The file records the observed SDK outcome; it is
            unsigned, has not been independently verified, and does not establish
            that the response is still current.
          </Text>

          <Heading as="h2" size="md" color="gray.100" mt={6} mb={2} id="enumeration">
            Enumeration
          </Heading>
          <Text color="gray.250" mb={3}>
            Dash Platform&apos;s SDK does not expose &quot;list all identities&quot;,
            &quot;list all contracts&quot;, &quot;list all tokens&quot;, &quot;list all
            documents&quot;, or &quot;list all transactions&quot; primitives. This
            explorer honours that constraint — wherever you&apos;d expect a
            browseable list, we either show a seeded list (paste the IDs you care
            about) or, where the SDK has a real list primitive (documents within a
            contract, epochs by index, DPNS labels by prefix, protocol votes,
            evonode block counts, contested resources, groups in a contract), we
            show a real, paginated browser.
          </Text>
          <Text color="gray.250" mb={3}>
            Platform also caps some lists. Contract and document history return at
            most 10 entries per request, and contract history has no offset, so
            only the 10 newest contract versions can be shown. History exists only
            for contracts and document types that keep it. Shielded notes load in
            windows of 8,192. Token holders are only the identities you supply,
            because there is no holder index.
          </Text>
          <Text color="gray.250" mb={3}>
            The raw GroveDB read that would fix this —{' '}
            <Link as={NextLink} href="/tools/?tool=path-elements" color="brand.light">
              <code>system.pathElements</code>
            </Link>
            , which the explorer exposes on the Tools page — is a <code>KeysInPath</code>{' '}
            batched point-get, not a range scan. You must already know the keys you want;
            there is no subtree enumeration exposed in{' '}
            <code>@dashevo/wasm-sdk</code> today. Full findings are in{' '}
            <code>docs/research/2026-04-22-path-query-and-token-lookup.md</code>.
          </Text>
          <Text color="gray.250" mb={3}>
            One real win in the same family: looking up a token by its ID alone now works.
            The SDK&apos;s <code>tokens.contractInfo(tokenId)</code> hits the GroveDB reverse
            index at <code>[RootTree::Tokens, TOKEN_CONTRACT_INFO_KEY]</code> and returns the
            owning contract + token position, so <code>/token/?id=…</code> resolves name,
            decimals, supply limits, and every token rule from the token ID without any
            prior context.
          </Text>

          <Heading as="h2" size="md" color="gray.100" mt={6} mb={2} id="write-mode">
            Write mode
          </Heading>
          <Text color="gray.250" mb={3}>
            Opt-in, and off in read-only deployments. Every operation is built, reviewed (inputs
            that contain private keys are never shown back), signed, and broadcast from your
            browser; mainnet needs a typed confirmation. Contract, document, token, DPNS and most
            identity operations sign with the identity connected on the wallet page, from a
            bridge backup, a mnemonic or a single WIF key, and only with an enabled on-chain key
            of the purpose and security level Platform requires. The browser-extension option only
            detects the extension; it cannot sign yet. Platform address operations (except funding
            addresses from your identity), asset-lock identity creation and top-ups, and masternode
            votes take their keys in the form instead and keep them in the tab only for that
            operation. The explorer does not build
            asset-lock transactions: bring the proof from a Core wallet, or use the bridge.
          </Text>
          <Text color="gray.250" mb={3}>
            Keys are never saved. A connected signer is cleared when you disconnect, after ten
            minutes without input, when you leave the wallet and broadcast pages, and when the tab
            closes; only the signer type and public identity ID are kept for this tab as a
            reconnect hint. Byte arrays the explorer owns are zeroed, but JavaScript strings and
            copies inside the SDK cannot be reliably erased. Writes are refused while the SDK
            session and the network run different Platform protocol versions.
          </Text>
          <Text color="gray.250" mb={3}>
            If a write fails after it was sent, the outcome is reported as unknown: check the
            affected identity or address before you send anything again, because a retry may spend
            twice. A signed transition from another tool can be decoded and broadcast unchanged
            under Advanced.
          </Text>

          <Heading as="h2" size="md" color="gray.100" mt={6} mb={2}>
            Privacy
          </Heading>
          <Text color="gray.250" mb={3}>
            Your queries go directly from your browser to DAPI. We never see them.
            No analytics, no telemetry. Your browser also contacts the network&apos;s
            quorum service (for quorum keys and the masternode list), Dash&apos;s Insight
            API or a custom devnet&apos;s own Insight URL (for the Core block height),
            the DASH/USD rate provider (Coinbase by default, unless the deployment
            turns it off), a remote well-known registry if the deployment configures
            one, and the bridge only if you follow a bridge link.
          </Text>
          <Text color="gray.250" mb={3}>
            Settings, saved items, saved queries, local registry entries and
            custom devnets are stored only in your browser&apos;s localStorage. The
            viewed-identities log is opt-in and stored the same way. None of it is
            transmitted.
          </Text>
          <Text color="gray.250" mb={3}>
            For mainnet and testnet, the SDK also keeps up to 100 data contracts it has
            fetched (<code>dash-sdk.contracts.&lt;network&gt;</code>) and the network&apos;s
            protocol version (<code>dash-sdk.protocol-version.&lt;network&gt;</code>) in
            localStorage, so later visits load faster. These hold public Platform data only,
            nothing about you or your keys. You can clear them from{' '}
            <Link as={NextLink} href="/settings/#connection" color="brand.light">
              Settings → Connection
            </Link>
            .
          </Text>

          <VerifyBuild />

          <Heading as="h2" size="md" color="gray.100" mt={6} mb={2}>
            Credits
          </Heading>
          <Text color="gray.250">
            Built on top of{' '}
            <Link href="https://github.com/dashevo/platform" isExternal color="brand.light">
              dashevo/platform
            </Link>
            ,{' '}
            <Link
              href="https://github.com/dashevo/platform/tree/master/packages/js-evo-sdk"
              isExternal
              color="brand.light"
            >
              @dashevo/evo-sdk
            </Link>
            . It started as a sibling of{' '}
            <Link href="https://github.com/pshenmic/platform-explorer" isExternal color="brand.light">
              pshenmic/platform-explorer
            </Link>
            .
          </Text>
        </Box>
      </InfoBlock>
    </Container>
  );
}
