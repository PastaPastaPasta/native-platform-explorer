'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Heading, Text, VStack } from '@chakra-ui/react';
import { Container } from '@ui/Container';
import { InfoBlock } from '@ui/InfoBlock';
import { LoadingCard } from '@ui/LoadingCard';
import { LookupInput } from '@ui/LookupInput';
import { Identifier } from '@components/data/Identifier';
import { StateTransitionResultView, validateStateTransitionHash } from '@components/tools/StateTransitionResultView';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import { usePageTitle } from '@hooks/usePageTitle';
import { useStateTransitionResult } from '@sdk/queries';
import { isHex64, shortId } from '@util/identifier';

function Content() {
  const params = useSearchParams();
  const hash = (params.get('hash') ?? '').trim();
  const valid = isHex64(hash);

  usePageBreadcrumbs([
    { label: 'Home', href: '/' },
    { label: 'State transition' },
    { label: hash ? shortId(hash) : '—' },
  ]);
  usePageTitle(valid ? `State transition ${shortId(hash)}` : 'State transition lookup');

  const q = useStateTransitionResult(valid ? hash : undefined);

  const lookup = (
    <LookupInput
      label="State transition hash"
      placeholder="64-char hex"
      description="Waits for Platform to report the transition's execution result (stateTransitions.waitForStateTransitionResult)."
      validate={validateStateTransitionHash}
      buildHref={(v) => `/state-transition/?hash=${encodeURIComponent(v.toLowerCase())}`}
      buttonLabel="Look up"
    />
  );

  if (!valid) {
    return (
      <Container py={{ base: 4, md: 6 }}>
        <InfoBlock emphasised>
          <VStack align="stretch" spacing={3}>
            <Heading as="h1" size="md">State transition lookup</Heading>
            <Text fontSize="sm" color="muted" maxW="70ch">
              Look up the result of a recently broadcast state transition by its hash. Platform
              answers once the transition has executed, so a lookup can take a while.
            </Text>
            {hash ? (
              <Text role="alert" fontSize="sm" color="failed">
                &ldquo;{shortId(hash, 12, 6)}&rdquo; is not a 64-character hex hash.
              </Text>
            ) : null}
            {lookup}
          </VStack>
        </InfoBlock>
      </Container>
    );
  }

  return (
    <Container py={{ base: 4, md: 6 }}>
      <VStack align="stretch" spacing={4}>
        <InfoBlock emphasised>
          <VStack align="stretch" spacing={3}>
            <Heading as="h1" size="md" color="gray.100">
              State transition result
            </Heading>
            <Identifier value={hash} avatar={false} copy highlight="both" copyLabel="Copy state transition hash" />
          </VStack>
        </InfoBlock>
        <StateTransitionResultView query={q} />
        <InfoBlock>{lookup}</InfoBlock>
      </VStack>
    </Container>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<LoadingCard />}>
      <Content />
    </Suspense>
  );
}
