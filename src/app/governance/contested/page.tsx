'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { parseAsString, useQueryStates } from 'nuqs';
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
import { usePageTitle } from '@hooks/usePageTitle';
import { useSdk } from '@sdk/hooks';
import { useContestedResources, useContract } from '@sdk/queries';
import { WELL_KNOWN, findWellKnown } from '@constants/well-known';
import { normaliseContract, contestedIndexes } from '@util/contract';
import { readProp } from '@util/sdk-shape';
import { safeStringify } from '@util/wasm-json';
import { isBase58Identifier } from '@util/identifier';


function Content() {
  const { network } = useSdk();
  // The selection (contract, document type, index) lives in the URL via nuqs,
  // which keeps ?network= and the deployment base path on every update.
  const [selection, setSelection] = useQueryStates(
    { contract: parseAsString, docType: parseAsString, index: parseAsString },
    { history: 'push' },
  );
  const contractFromUrl = selection.contract ?? '';
  const docTypeFromUrl = selection.docType ?? '';

  const [contractInput, setContractInput] = useState(contractFromUrl);
  useEffect(() => setContractInput(contractFromUrl), [contractFromUrl]);
  const contractInputError = contractInput.trim() && !isBase58Identifier(contractInput.trim())
    ? 'Expected a 43–44 character base58 contract ID.'
    : null;
  const wellKnown = contractFromUrl ? findWellKnown(contractFromUrl) : undefined;

  usePageBreadcrumbs([
    { label: 'Home', href: '/' },
    { label: 'Governance' },
    { label: 'Contested' },
  ]);
  usePageTitle(wellKnown ? `Contested · ${wellKnown.name}` : 'Contested resources');

  const contractQ = useContract(contractFromUrl || undefined);
  const contract = contractQ.data ? normaliseContract(contractQ.data) : null;
  const contested = contract ? contestedIndexes(contract) : [];

  // Auto-navigate to the contested doc type when there's exactly one and URL doesn't have one yet.
  const autoContested = contested.length === 1 ? contested[0] : undefined;
  const autoDocType = autoContested?.docType;
  const autoIndexName = autoContested?.indexName;
  useEffect(() => {
    if (autoDocType && autoIndexName && contractFromUrl && !docTypeFromUrl) {
      void setSelection({ docType: autoDocType, index: autoIndexName }, { history: 'replace' });
    }
  }, [autoDocType, autoIndexName, contractFromUrl, docTypeFromUrl, setSelection]);

  // Resolve effective index name: URL param > auto-detected from schema > well-known > fallback
  const effectiveIndex = selection.index
    ?? contested.find((c) => c.docType === docTypeFromUrl)?.indexName
    ?? wellKnown?.contested?.indexName
    ?? 'parentNameAndLabel';

  // For a composite index with N properties, pass the first N-1 values as
  // startIndexValues so the API returns the remaining "middle" property.
  // We then reconstruct full index tuples by prepending the prefix.
  // NOTE: startIndexValues currently triggers a GroveDB proof bug on Platform.
  const indexValuePrefix = wellKnown?.contested?.indexValuePrefix;
  const resourcesQ = useContestedResources(
    contractFromUrl || undefined,
    docTypeFromUrl || undefined,
    effectiveIndex,
    indexValuePrefix,
  );
  const resources = useMemo(() => {
    const raw = resourcesQ.data;
    if (!Array.isArray(raw)) return [];
    return raw;
  }, [resourcesQ.data]);

  const pushUrl = (contract: string) => {
    // A new contract starts a new selection.
    void setSelection({ contract, docType: null, index: null });
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
            <HStack
              as="form"
              spacing={2}
              width="100%"
              onSubmit={(e) => {
                e.preventDefault();
                if (!contractInputError && contractInput.trim()) pushUrl(contractInput.trim());
              }}
            >
              <Input
                size="sm"
                aria-label="Contract ID"
                placeholder="Contract ID"
                value={contractInput}
                onChange={(e) => setContractInput(e.target.value)}
                isInvalid={!!contractInputError}
                fontFamily="mono"
                bg="gray.800"
                borderColor="gray.700"
              />
              <Button
                type="submit"
                size="sm"
                colorScheme="blue"
                isDisabled={contractInput.trim().length === 0 || !!contractInputError}
              >
                Use
              </Button>
            </HStack>
            {contractInputError ? <Text role="alert" fontSize="xs" color="red.300">{contractInputError}</Text> : null}
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
                            onClick={() => void setSelection({ docType: c.docType, index: c.indexName })}
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
              <>
                <ErrorCard error={resourcesQ.error} onRetry={() => resourcesQ.refetch()} />
                <CodeBlock
                  value={`// Reproduce with @dashevo/evo-sdk
const sdk = await EvoSDK.${network}();
await sdk.connect();
await sdk.group.contestedResources(${JSON.stringify({
                    dataContractId: contractFromUrl,
                    documentTypeName: docTypeFromUrl,
                    indexName: effectiveIndex,
                    ...(indexValuePrefix ? { startIndexValues: indexValuePrefix } : {}),
                  }, null, 2)});`}
                />
              </>
            ) : resources.length === 0 ? (
              <Text color="gray.400" fontSize="sm">
                No active contested resources for this document type.
              </Text>
            ) : (
              <Wrap spacing={2}>
                {resources.map((r, i) => {
                  // The API returns only the "middle" property value.
                  // Reconstruct the full index tuple by prepending the prefix.
                  const middleValue = Array.isArray(r)
                    ? r
                    : readProp<unknown>(r, 'indexValues') ?? r;
                  const fullValues = [
                    ...(indexValuePrefix ?? []),
                    ...(Array.isArray(middleValue) ? middleValue : [middleValue]),
                  ];
                  const encoded = encodeURIComponent(safeStringify(fullValues, 0));
                  const label = String(Array.isArray(middleValue) ? middleValue.join(' / ') : middleValue ?? '—');
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
