'use client';

import NextLink from 'next/link';
import { Container } from '@ui/Container';
import { InfoBlock } from '@ui/InfoBlock';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import { Box, Heading, Link, Text } from '@chakra-ui/react';

// Simple static rendering. We skip react-markdown here so Stage 5 avoids a
// new runtime dep + SSR concern; the source file at `src/content/about.md` is
// the editable canonical version and can be swapped for markdown rendering
// in a later polish pass.
export default function Page() {
  usePageBreadcrumbs([{ label: 'Home', href: '/' }, { label: 'About' }]);
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
            </Link>
            . There is no API server, no database, and no indexer behind this site —
            every value you see has been fetched from a masternode&apos;s DAPI endpoint
            by the WASM SDK running in your browser, and (by default) verified
            against a prefetched set of quorum public keys.
          </Text>
          <Text color="gray.250" mb={3}>
            It is a deliberate, reduced-scope sibling of{' '}
            <Link href="https://platform-explorer.com" isExternal color="brand.light">
              platform-explorer
            </Link>
            . Because it has no indexer it cannot browse every identity, contract,
            token, block, or transaction. In exchange, it can ship as a single
            static bundle that anyone can host, every response carries a
            cryptographic proof, and there is no middleman between you and the
            network.
          </Text>

          <Heading as="h2" size="md" color="gray.100" mt={6} mb={2} id="proofs">
            Proofs
          </Heading>
          <Text color="gray.250" mb={3}>
            Your browser connects directly to DAPI and asks for data. In trusted
            mode the SDK also asks DAPI for a GroveDB Merkle proof; the WASM
            engine then verifies that proof locally against quorum public keys
            fetched when the SDK connected. The UI surfaces the outcome via the{' '}
            <strong>ProofChip</strong> next to each DigestCard.
          </Text>
          <Text color="gray.250" mb={3}>
            Some SDK methods (system status, quorum info, DASH/USD rate, a few
            boolean DPNS helpers) have no proof variant — we label those
            honestly as &quot;No proof&quot;, rather than pretending otherwise.
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
            contested resources, groups in a contract), we show a real, paginated
            browser.
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

          <Heading as="h2" size="md" color="gray.100" mt={6} mb={2}>
            Privacy
          </Heading>
          <Text color="gray.250" mb={3}>
            Your queries go directly from your browser to DAPI. We never see them.
            No analytics, no telemetry. The session-viewed-identities log (opt-in)
            is stored only in your browser&apos;s localStorage and never transmitted.
          </Text>

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
            , and visually mirrors{' '}
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
