'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import NextLink from 'next/link';
import {
  Button,
  Heading,
  HStack,
  Input,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  Text,
  VStack,
  Wrap,
  WrapItem,
} from '@chakra-ui/react';
import { ChevronDownIcon } from '@chakra-ui/icons';
import { Container } from '@ui/Container';
import { InfoBlock } from '@ui/InfoBlock';
import { LoadingCard } from '@ui/LoadingCard';
import { ErrorCard } from '@ui/ErrorCard';
import { CodeBlock } from '@components/data/CodeBlock';
import { Identifier } from '@components/data/Identifier';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import { useContestedResources, useContract } from '@sdk/queries';
import { WELL_KNOWN, findWellKnown } from '@constants/well-known';
import { normaliseContract, contestedIndexes } from '@util/contract';
import { readProp } from '@util/sdk-shape';
import { safeStringify } from '@util/wasm-json';

function decodeIndexValues(raw: unknown): string {
  try {
    if (Array.isArray(raw)) return raw.map((v) => String(v)).join(' / ');
    return String(raw ?? '—');
  } catch {
    return '—';
  }
}

function Content() {
  const router = useRouter();
  const params = useSearchParams();
  const contractFromUrl = params.get('contract') ?? '';
  const docTypeFromUrl = params.get('docType') ?? '';

  const [contractInput, setContractInput] = useState(contractFromUrl);
  const wellKnown = contractFromUrl ? findWellKnown(contractFromUrl) : undefined;

  usePageBreadcrumbs([
    { label: 'Home', href: '/' },
    { label: 'Governance' },
    { label: 'Contested' },
  ]);

  const contractQ = useContract(contractFromUrl || undefined);
  const contract = contractQ.data ? normaliseContract(contractQ.data) : null;
  const contested = contract ? contestedIndexes(contract) : [];

  // Auto-navigate to the contested doc type when there's exactly one and URL doesn't have one yet.
  const autoContested = contested.length === 1 ? contested[0] : undefined;
  const autoDocType = autoContested?.docType;
  const autoIndexName = autoContested?.indexName;
  useEffect(() => {
    if (autoDocType && autoIndexName && contractFromUrl && !docTypeFromUrl) {
      const qp = new URLSearchParams({ contract: contractFromUrl, docType: autoDocType, index: autoIndexName });
      router.replace(`/governance/contested/?${qp.toString()}`);
    }
  }, [autoDocType, autoIndexName, contractFromUrl, docTypeFromUrl, router]);

  // Resolve effective index name: URL param > auto-detected from schema > well-known > fallback
  const effectiveIndex = params.get('index')
    ?? contested.find((c) => c.docType === docTypeFromUrl)?.indexName
    ?? wellKnown?.contested?.indexName
    ?? 'parentNameAndLabel';

  const indexValuePrefix = wellKnown?.contested?.indexValuePrefix;
  const resourcesQ = useContestedResources(
    contractFromUrl || undefined,
    docTypeFromUrl || undefined,
    effectiveIndex,
    indexValuePrefix,
    indexValuePrefix,
  );
  const resources = useMemo(() => {
    const raw = resourcesQ.data;
    if (!Array.isArray(raw)) return [];
    return raw;
  }, [resourcesQ.data]);

  const pushUrl = (contract: string, docType?: string) => {
    const qp = new URLSearchParams();
    qp.set('contract', contract);
    if (docType) qp.set('docType', docType);
    router.push(`/governance/contested/?${qp.toString()}`);
  };

  return (
    <Container py={{ base: 4, md: 6 }}>
      <VStack align="stretch" spacing={4}>
        <InfoBlock emphasised>
          <VStack align="flex-start" spacing={3}>
            <Heading size="md" color="gray.100">
              Contested resources
            </Heading>
            <Text fontSize="xs" color="gray.400">
              Pick a contract (DPNS or any other that declares contested resources) and a
              document type.
            </Text>
            <HStack spacing={2}>
              <Input
                size="sm"
                placeholder="Contract ID"
                value={contractInput}
                onChange={(e) => setContractInput(e.target.value)}
                fontFamily="mono"
                bg="gray.800"
                borderColor="gray.700"
              />
              <Button
                size="sm"
                colorScheme="blue"
                onClick={() => pushUrl(contractInput.trim(), docTypeFromUrl || undefined)}
                isDisabled={contractInput.trim().length === 0}
              >
                Use
              </Button>
            </HStack>
            <HStack spacing={2} flexWrap="wrap">
              <Text fontSize="xs" color="gray.400">
                Quick-pick:
              </Text>
              {WELL_KNOWN.filter((w) => w.kind === 'contract' && w.contested).map((w) => {
                const qp = new URLSearchParams({ contract: w.id });
                if (w.contested) {
                  qp.set('docType', w.contested.docType);
                  qp.set('index', w.contested.indexName);
                }
                return (
                  <Button
                    key={w.id}
                    as={NextLink}
                    href={`/governance/contested/?${qp.toString()}`}
                    size="xs"
                    variant="outline"
                    colorScheme="blue"
                  >
                    {w.name}
                  </Button>
                );
              })}
            </HStack>
          </VStack>
        </InfoBlock>

        {contractFromUrl ? (
          <InfoBlock>
            <VStack align="flex-start" spacing={3}>
              <HStack>
                <Text fontSize="xs" color="gray.400" textTransform="uppercase">
                  Contract
                </Text>
                <Identifier
                  value={contractFromUrl}
                  href={`/contract/?id=${encodeURIComponent(contractFromUrl)}`}
                  dense
                />
              </HStack>
              {contractQ.isLoading ? (
                <LoadingCard lines={1} />
              ) : contract ? (
                contested.length === 0 ? (
                  <Text fontSize="xs" color="gray.400">
                    No contested indexes found in this contract.
                  </Text>
                ) : contested.length === 1 ? (
                  <HStack>
                    <Text fontSize="xs" color="gray.400">
                      Document type:
                    </Text>
                    <Text fontSize="xs" color="gray.100" fontFamily="mono">
                      {autoContested!.docType}
                    </Text>
                    <Text fontSize="xs" color="gray.500">
                      (index: {autoContested!.indexName})
                    </Text>
                  </HStack>
                ) : (
                  <HStack>
                    <Text fontSize="xs" color="gray.400">
                      Contested index:
                    </Text>
                    <Menu>
                      <MenuButton as={Button} rightIcon={<ChevronDownIcon />} size="xs" variant="outline">
                        {docTypeFromUrl ? `${docTypeFromUrl} / ${effectiveIndex}` : 'choose…'}
                      </MenuButton>
                      <MenuList bg="gray.800" borderColor="gray.700">
                        {contested.map((c) => (
                          <MenuItem
                            key={`${c.docType}/${c.indexName}`}
                            bg="transparent"
                            _hover={{ bg: 'gray.750' }}
                            onClick={() => {
                              const qp = new URLSearchParams({ contract: contractFromUrl, docType: c.docType, index: c.indexName });
                              router.push(`/governance/contested/?${qp.toString()}`);
                            }}
                          >
                            {c.docType} / {c.indexName}
                          </MenuItem>
                        ))}
                      </MenuList>
                    </Menu>
                  </HStack>
                )
              ) : null}
            </VStack>
          </InfoBlock>
        ) : null}

        {contractFromUrl && docTypeFromUrl ? (
          <InfoBlock>
            <Heading size="sm" color="gray.100" mb={3}>
              Resources
            </Heading>
            {resourcesQ.isLoading ? (
              <LoadingCard lines={4} />
            ) : resourcesQ.isError ? (
              <ErrorCard error={resourcesQ.error} onRetry={() => resourcesQ.refetch()} />
            ) : resources.length === 0 ? (
              <Text color="gray.400" fontSize="sm">
                No active contested resources for this document type.
              </Text>
            ) : (
              <Wrap spacing={2}>
                {resources.map((r, i) => {
                  const values = Array.isArray(r)
                    ? r
                    : readProp<unknown[]>(r, 'indexValues') ?? r;
                  const encoded = encodeURIComponent(safeStringify(values, 0));
                  const label = decodeIndexValues(values);
                  return (
                    <WrapItem key={i}>
                      <Button
                        as={NextLink}
                        href={`/governance/contested/detail/?contract=${encodeURIComponent(contractFromUrl)}&docType=${encodeURIComponent(docTypeFromUrl)}&indexName=${encodeURIComponent(effectiveIndex)}&indexValues=${encoded}`}
                        size="sm"
                        variant="outline"
                        colorScheme="blue"
                      >
                        {label}
                      </Button>
                    </WrapItem>
                  );
                })}
              </Wrap>
            )}
            <CodeBlock value={resources} collapsedHeight={80} />
          </InfoBlock>
        ) : null}
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
