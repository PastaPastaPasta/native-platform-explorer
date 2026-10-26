'use client';

import { useState, type FormEvent } from 'react';
import NextLink from 'next/link';
import {
  Button,
  FormControl,
  FormErrorMessage,
  FormLabel,
  Heading,
  HStack,
  Input,
  Text,
  VStack,
  Wrap,
  WrapItem,
} from '@chakra-ui/react';
import { Container } from '@ui/Container';
import { InfoBlock } from '@ui/InfoBlock';
import { LoadingCard } from '@ui/LoadingCard';
import { ErrorCard } from '@ui/ErrorCard';
import { useWellKnownEntries } from '@hooks/useWellKnownRegistry';
import { useContract } from '@sdk/queries';
import { documentTypeNames, normaliseContract } from '@util/contract';
import { isBase58Identifier } from '@util/identifier';

function documentsHref(contractId: string, type: string): string {
  return `/contract/documents/?id=${encodeURIComponent(contractId)}&type=${encodeURIComponent(type)}`;
}

/** Contract + document-type picker shown when /contract/documents has no
 *  `?id&type`. A contract given without a type (`?id=…`) is preselected. */
export function DocumentsLanding({ initialContractId = '' }: { initialContractId?: string }) {
  const [input, setInput] = useState(initialContractId);
  const [contractId, setContractId] = useState(isBase58Identifier(initialContractId) ? initialContractId : '');
  const inputError = input.trim() && !isBase58Identifier(input.trim()) ? 'Expected a 43–44 char base58 contract ID.' : null;
  const wellKnown = useWellKnownEntries('contract');
  const contractQ = useContract(contractId || undefined);
  const types = contractQ.data ? documentTypeNames(normaliseContract(contractQ.data)) : [];

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!inputError && input.trim()) setContractId(input.trim());
  };

  return (
    <Container py={{ base: 4, md: 6 }}>
      <VStack align="stretch" spacing={4}>
        <InfoBlock emphasised>
          <VStack align="stretch" spacing={3}>
            <Heading as="h1" size="md">Browse documents</Heading>
            <Text fontSize="sm" color="muted" maxW="70ch">
              Documents are listed per contract and document type. Choose a contract, then one
              of its document types.
            </Text>
            <HStack as="form" align="end" spacing={2} onSubmit={submit} aria-label="Choose a contract">
              <FormControl isInvalid={!!inputError}>
                <FormLabel fontSize="xs" color="muted" textTransform="uppercase" letterSpacing="0.08em">
                  Contract ID
                </FormLabel>
                <Input
                  size="sm"
                  fontFamily="mono"
                  placeholder="43–44 char base58 Identifier"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                />
                {inputError ? <FormErrorMessage fontSize="xs">{inputError}</FormErrorMessage> : null}
              </FormControl>
              <Button type="submit" size="sm" variant="outline" isDisabled={!input.trim() || !!inputError}>
                Load types
              </Button>
            </HStack>
            {wellKnown.length > 0 ? (
              <HStack spacing={2} flexWrap="wrap">
                <Text fontSize="xs" color="muted">Well-known:</Text>
                {wellKnown.map((entry) => (
                  <Button
                    key={entry.id}
                    size="xs"
                    variant={entry.id === contractId ? 'solid' : 'outline'}
                    onClick={() => { setInput(entry.id); setContractId(entry.id); }}
                  >
                    {entry.name}
                  </Button>
                ))}
              </HStack>
            ) : null}
          </VStack>
        </InfoBlock>

        {contractId ? (
          contractQ.isLoading ? (
            <LoadingCard lines={2} />
          ) : contractQ.isError ? (
            <ErrorCard error={contractQ.error} onRetry={() => { void contractQ.refetch(); }} />
          ) : !contractQ.data ? (
            <InfoBlock>
              <Text fontSize="sm" color="muted">No contract with this ID on the current network.</Text>
            </InfoBlock>
          ) : (
            <InfoBlock>
              <VStack align="stretch" spacing={3}>
                <Heading size="sm">Document types</Heading>
                {types.length === 0 ? (
                  <Text fontSize="sm" color="muted">This contract defines no document types.</Text>
                ) : (
                  <Wrap spacing={2}>
                    {types.map((type) => (
                      <WrapItem key={type}>
                        <Button as={NextLink} href={documentsHref(contractId, type)} size="sm" variant="outline" fontFamily="mono">
                          {type}
                        </Button>
                      </WrapItem>
                    ))}
                  </Wrap>
                )}
              </VStack>
            </InfoBlock>
          )
        ) : null}
      </VStack>
    </Container>
  );
}
