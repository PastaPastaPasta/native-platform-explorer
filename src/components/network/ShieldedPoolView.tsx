'use client';

import { useMemo, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Heading,
  HStack,
  Table,
  Tbody,
  Td,
  Text,
  Textarea,
  Th,
  Thead,
  Tr,
  VStack,
} from '@chakra-ui/react';
import { Container } from '@ui/Container';
import { InfoBlock } from '@ui/InfoBlock';
import { LoadingCard } from '@ui/LoadingCard';
import { ErrorCard } from '@ui/ErrorCard';
import { CreditsBlock } from '@components/data/CreditsBlock';
import { ProofChip } from '@components/data/ProofChip';
import { CopyButton } from '@ui/CopyButton';
import { CursorPagination } from '@components/pagination/CursorPagination';
import { usePageBreadcrumbs } from '@hooks/usePageBreadcrumbs';
import {
  useShieldedAnchors,
  useShieldedEncryptedNotes,
  useShieldedMostRecentAnchor,
  useShieldedNullifiers,
  useShieldedPoolState,
} from '@sdk/queries';
import { readProp } from '@util/sdk-shape';
import { bytesToHex } from '@sdk/evidence';
import { SHIELDED_NOTES_WINDOW, parseNullifierList } from '@util/shielded';

const ANCHORS_PAGE = 10;
const NOTES_PAGE = 25;

function hexOf(value: unknown): string | undefined {
  return value instanceof Uint8Array ? bytesToHex(value) : undefined;
}

function Hash({ hex, full = false }: { hex: string | undefined; full?: boolean }) {
  if (!hex) return <Text as="span" color="gray.400">—</Text>;
  return (
    <HStack as="span" spacing={1} display="inline-flex">
      <Text as="span" fontFamily="mono" fontSize="xs" color="gray.100" wordBreak="break-all" title={hex}>
        {full ? hex : `${hex.slice(0, 12)}…${hex.slice(-8)}`}
      </Text>
      <CopyButton value={hex} />
    </HStack>
  );
}

function SectionHeading({ title, proofState }: { title: string; proofState?: Parameters<typeof ProofChip>[0]['proofState'] }) {
  return (
    <HStack spacing={2} mb={2}>
      <Heading size="sm" color="gray.100">{title}</Heading>
      {proofState ? <ProofChip proofState={proofState} size="xs" /> : null}
    </HStack>
  );
}

function Anchors() {
  const q = useShieldedAnchors();
  const [page, setPage] = useState(0);
  const anchors = Array.isArray(q.data) ? (q.data as unknown[]).map(hexOf).filter((h): h is string => !!h) : [];
  const shown = anchors.slice(page * ANCHORS_PAGE, (page + 1) * ANCHORS_PAGE);
  return (
    <InfoBlock>
      <SectionHeading title={`Valid anchors${q.data ? ` (${anchors.length})` : ''}`} proofState={q.proofState} />
      <Text fontSize="xs" color="gray.400" mb={2}>
        Commitment-tree roots a spend proof may reference. Platform returns the whole set in one response.
      </Text>
      {q.isLoading ? <LoadingCard lines={2} />
        : q.isError ? <ErrorCard error={q.error} onRetry={() => q.refetch()} />
          : anchors.length === 0 ? <Text fontSize="sm" color="gray.400">No anchors yet: nothing has been shielded on this network.</Text>
            : (
              <VStack align="stretch" spacing={1}>
                {shown.map((hex, i) => (
                  <HStack key={hex} spacing={3}>
                    <Text fontFamily="mono" fontSize="xs" color="gray.500" minW={8}>{page * ANCHORS_PAGE + i + 1}</Text>
                    <Hash hex={hex} full />
                  </HStack>
                ))}
                <CursorPagination
                  pageIndex={page}
                  hasPrev={page > 0}
                  hasNext={(page + 1) * ANCHORS_PAGE < anchors.length}
                  onPrev={() => setPage((p) => p - 1)}
                  onNext={() => setPage((p) => p + 1)}
                />
              </VStack>
            )}
    </InfoBlock>
  );
}

function NullifierLookup({ input, onInput }: { input: string; onInput: (v: string) => void }) {
  const [submitted, setSubmitted] = useState<string[] | undefined>(undefined);
  const parsed = useMemo(() => parseNullifierList(input), [input]);
  const q = useShieldedNullifiers(submitted);
  const statuses = Array.isArray(q.data) ? (q.data as unknown[]) : [];
  return (
    <InfoBlock>
      <SectionHeading title="Nullifier lookup" proofState={submitted ? q.proofState : undefined} />
      <Text fontSize="xs" color="gray.400" mb={2}>
        A nullifier is published when a note is spent. Paste one or more 32-byte nullifiers (hex or base64)
        to see whether Platform has recorded them as spent.
      </Text>
      <Textarea
        size="sm"
        rows={3}
        value={input}
        onChange={(e) => onInput(e.target.value)}
        placeholder="64 hex characters per nullifier, separated by spaces, commas or new lines"
        aria-label="Nullifiers to look up"
        fontFamily="mono"
        bg="gray.800"
        borderColor="gray.700"
      />
      {parsed.errors.map((e) => <Text key={e} fontSize="xs" color="warning" mt={1}>{e}</Text>)}
      <HStack justify="flex-end" mt={2}>
        <Button
          size="sm"
          colorScheme="blue"
          isDisabled={parsed.hexes.length === 0 || parsed.errors.length > 0}
          onClick={() => setSubmitted(parsed.hexes)}
        >
          Check {parsed.hexes.length > 1 ? `${parsed.hexes.length} nullifiers` : 'nullifier'}
        </Button>
      </HStack>
      {submitted ? (
        q.isLoading ? <LoadingCard lines={1} />
          : q.isError ? <ErrorCard error={q.error} onRetry={() => q.refetch()} />
            : (
              <Table size="sm" mt={2} aria-label="Nullifier statuses">
                <Thead>
                  <Tr>
                    <Th color="gray.400" borderColor="gray.750">Nullifier</Th>
                    <Th color="gray.400" borderColor="gray.750">Status</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {statuses.map((s, i) => {
                    const hex = hexOf(readProp<unknown>(s, 'nullifier')) ?? submitted[i];
                    const spent = readProp<boolean>(s, 'isSpent') === true;
                    return (
                      <Tr key={`${hex}-${i}`}>
                        <Td borderColor="gray.750"><Hash hex={hex} /></Td>
                        <Td borderColor="gray.750">
                          <Badge colorScheme={spent ? 'orange' : 'gray'} variant="subtle">{spent ? 'spent' : 'not spent'}</Badge>
                        </Td>
                      </Tr>
                    );
                  })}
                </Tbody>
              </Table>
            )
      ) : null}
    </InfoBlock>
  );
}

function EncryptedNotes({ onCheckNullifier }: { onCheckNullifier: (hex: string) => void }) {
  const [windowIndex, setWindowIndex] = useState(0);
  const [loaded, setLoaded] = useState<number | undefined>(undefined);
  const [page, setPage] = useState(0);
  const start = loaded === undefined ? undefined : loaded * SHIELDED_NOTES_WINDOW;
  const q = useShieldedEncryptedNotes(start, SHIELDED_NOTES_WINDOW);
  const notes = Array.isArray(q.data) ? (q.data as unknown[]) : [];
  const shown = notes.slice(page * NOTES_PAGE, (page + 1) * NOTES_PAGE);
  const firstIndex = windowIndex * SHIELDED_NOTES_WINDOW;

  const load = (w: number) => {
    setWindowIndex(w);
    setLoaded(w);
    setPage(0);
  };

  return (
    <InfoBlock>
      <SectionHeading title="Encrypted notes" proofState={loaded !== undefined ? q.proofState : undefined} />
      <Text fontSize="xs" color="gray.400" mb={2}>
        Every shielded output, in commitment-tree order. Only a holder of the viewing key can decrypt a
        note. Platform serves notes in windows of {SHIELDED_NOTES_WINDOW.toLocaleString('en-US')} that must
        start on a window boundary, so a whole window is fetched (and proved) at once.
      </Text>
      <HStack spacing={3} flexWrap="wrap" mb={2}>
        <Text fontSize="sm" color="gray.250">
          Window {windowIndex + 1}: notes {firstIndex.toLocaleString('en-US')}–{(firstIndex + SHIELDED_NOTES_WINDOW - 1).toLocaleString('en-US')}
        </Text>
        <Button size="xs" variant="outline" isDisabled={windowIndex === 0} onClick={() => load(windowIndex - 1)}>Previous window</Button>
        <Button size="xs" colorScheme="blue" onClick={() => load(windowIndex)} isDisabled={loaded === windowIndex}>
          {loaded === windowIndex ? 'Loaded' : 'Load window'}
        </Button>
        <Button
          size="xs"
          variant="outline"
          isDisabled={loaded !== windowIndex || notes.length < SHIELDED_NOTES_WINDOW}
          onClick={() => load(windowIndex + 1)}
        >
          Next window
        </Button>
      </HStack>
      {loaded === undefined ? null
        : q.isLoading ? <LoadingCard lines={3} />
          : q.isError ? <ErrorCard error={q.error} onRetry={() => q.refetch()} />
            : notes.length === 0 ? (
              <Text fontSize="sm" color="gray.400">
                {windowIndex === 0 ? 'No notes yet: nothing has been shielded on this network.' : 'No notes in this window.'}
              </Text>
            ) : (
              <VStack align="stretch" spacing={2}>
                <Text fontSize="xs" color="gray.400">
                  {notes.length.toLocaleString('en-US')} notes in this window
                  {notes.length < SHIELDED_NOTES_WINDOW ? ' — the end of the tree' : ''}.
                </Text>
                <Box overflowX="auto">
                  <Table size="sm" aria-label="Encrypted notes">
                    <Thead>
                      <Tr>
                        <Th color="gray.400" borderColor="gray.750" isNumeric>Position</Th>
                        <Th color="gray.400" borderColor="gray.750">Note commitment (cmx)</Th>
                        <Th color="gray.400" borderColor="gray.750">Action nullifier</Th>
                        <Th color="gray.400" borderColor="gray.750">Value commitment (cv_net)</Th>
                        <Th color="gray.400" borderColor="gray.750" isNumeric>Ciphertext</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {shown.map((n, i) => {
                        const nullifier = hexOf(readProp<unknown>(n, 'nullifier'));
                        const ciphertext = readProp<unknown>(n, 'encryptedNote');
                        return (
                          <Tr key={`${firstIndex + page * NOTES_PAGE + i}`}>
                            <Td borderColor="gray.750" isNumeric fontFamily="mono" fontSize="xs">{(firstIndex + page * NOTES_PAGE + i).toLocaleString('en-US')}</Td>
                            <Td borderColor="gray.750"><Hash hex={hexOf(readProp<unknown>(n, 'cmx'))} /></Td>
                            <Td borderColor="gray.750">
                              <HStack spacing={1}>
                                <Hash hex={nullifier} />
                                {nullifier ? (
                                  <Button size="xs" variant="ghost" onClick={() => onCheckNullifier(nullifier)}>check</Button>
                                ) : null}
                              </HStack>
                            </Td>
                            <Td borderColor="gray.750"><Hash hex={hexOf(readProp<unknown>(n, 'cvNet'))} /></Td>
                            <Td borderColor="gray.750" isNumeric fontFamily="mono" fontSize="xs">
                              {ciphertext instanceof Uint8Array ? `${ciphertext.length} B` : '—'}
                            </Td>
                          </Tr>
                        );
                      })}
                    </Tbody>
                  </Table>
                </Box>
                <Text fontSize="2xs" color="gray.500">
                  Each note is stored with the nullifier revealed by the Orchard action that created it; wallets need
                  it to derive the note (its ρ) during trial decryption. It is not this note&apos;s own nullifier, which
                  only the note&apos;s owner can compute, so &ldquo;check&rdquo; looks up the action&apos;s nullifier.
                </Text>
                <CursorPagination
                  pageIndex={page}
                  hasPrev={page > 0}
                  hasNext={(page + 1) * NOTES_PAGE < notes.length}
                  onPrev={() => setPage((p) => p - 1)}
                  onNext={() => setPage((p) => p + 1)}
                />
              </VStack>
            )}
    </InfoBlock>
  );
}

export function ShieldedPoolView() {
  usePageBreadcrumbs([{ label: 'Home', href: '/' }, { label: 'Network' }, { label: 'Shielded pool' }]);
  const poolQ = useShieldedPoolState();
  const anchorQ = useShieldedMostRecentAnchor();
  const [nullifierInput, setNullifierInput] = useState('');

  return (
    <Container py={{ base: 4, md: 6 }}>
      <VStack align="stretch" spacing={4}>
        <InfoBlock emphasised>
          <VStack align="stretch" spacing={3}>
            <Heading as="h1" size="md" color="gray.100">Shielded pool</Heading>
            <Text fontSize="sm" color="gray.250">
              Platform&apos;s Orchard shielded pool. Balances and owners inside it are private; what is public is
              the pool total, the commitment tree (anchors and encrypted notes) and the nullifiers of spent notes.
            </Text>
            <HStack spacing={10} flexWrap="wrap" align="flex-start">
              <VStack align="flex-start" spacing={1}>
                <HStack spacing={2}>
                  <Text fontSize="xs" color="gray.250" textTransform="uppercase" letterSpacing="wide">Total shielded balance</Text>
                  <ProofChip proofState={poolQ.proofState} size="xs" />
                </HStack>
                {poolQ.isLoading ? <LoadingCard lines={1} />
                  : poolQ.isError ? <ErrorCard error={poolQ.error} onRetry={() => poolQ.refetch()} />
                    : poolQ.data === null || poolQ.data === undefined
                      ? <Text fontSize="sm" color="gray.400">No pool state: nothing has been shielded on this network.</Text>
                      : <CreditsBlock credits={poolQ.data as bigint} />}
              </VStack>
              <VStack align="flex-start" spacing={1} minW={0}>
                <HStack spacing={2}>
                  <Text fontSize="xs" color="gray.250" textTransform="uppercase" letterSpacing="wide">Most recent anchor</Text>
                  <ProofChip proofState={anchorQ.proofState} size="xs" />
                </HStack>
                {anchorQ.isLoading ? <LoadingCard lines={1} />
                  : anchorQ.isError ? <ErrorCard error={anchorQ.error} onRetry={() => anchorQ.refetch()} />
                    : hexOf(anchorQ.data) ? <Hash hex={hexOf(anchorQ.data)} full />
                      : <Text fontSize="sm" color="gray.400">None yet.</Text>}
              </VStack>
            </HStack>
          </VStack>
        </InfoBlock>
        <Anchors />
        <NullifierLookup input={nullifierInput} onInput={setNullifierInput} />
        <EncryptedNotes onCheckNullifier={(hex) => setNullifierInput(hex)} />
      </VStack>
    </Container>
  );
}
