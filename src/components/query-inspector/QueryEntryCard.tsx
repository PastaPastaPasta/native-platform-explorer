'use client';

import {
  AccordionButton,
  AccordionItem,
  AccordionPanel,
  Badge,
  Box,
  Code,
  HStack,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Text,
  VStack,
  IconButton,
  Spinner,
  Tooltip,
} from '@chakra-ui/react';
import { ChevronDownIcon, ChevronUpIcon, CopyIcon } from '@chakra-ui/icons';
import { useEffect, useState } from 'react';
import type { QueryProofEntry } from '@/contexts/QueryProofStore';
import { METHOD_ANNOTATIONS, PROOF_FIELD_ANNOTATIONS } from './annotations';
import { ProofExplainer } from './ProofExplainer';
import { ProofTreeView } from './ProofTreeView';

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(1)} KB`;
}

function FieldRow({ label, value, annotation }: { label: string; value: string; annotation?: string }) {
  return (
    <Box>
      <HStack spacing={2} align="baseline">
        <Text fontSize="2xs" color="gray.400" fontWeight="600" textTransform="uppercase" minW="120px">
          {label}
        </Text>
        <Text fontSize="xs" fontFamily="mono" color="gray.100" wordBreak="break-all">
          {value}
        </Text>
      </HStack>
      {annotation ? (
        <Text fontSize="2xs" color="gray.500" ml="120px" mt={0.5}>{annotation}</Text>
      ) : null}
    </Box>
  );
}

function MiniCodeBlock({ value, collapsedHeight = 300 }: { value: string; collapsedHeight?: number }) {
  const [expanded, setExpanded] = useState(false);
  // ~14px per line at 2xs font; treat anything noticeably taller than the
  // collapsed box as "long" so we show the expand toggle. The full text is
  // ALWAYS in the DOM — collapsed just means scrollable within a smaller box.
  const long = value.length > 600 || value.split('\n').length > 16;

  return (
    <Box position="relative" borderRadius="md" overflow="hidden" border="1px solid" borderColor="gray.750">
      <HStack position="absolute" top={1} right={1} zIndex={2}>
        <Tooltip label="Copy" hasArrow>
          <IconButton
            aria-label="Copy"
            icon={<CopyIcon />}
            size="xs"
            variant="ghost"
            onClick={() => { navigator.clipboard?.writeText(value); }}
          />
        </Tooltip>
        {long ? (
          <Tooltip label={expanded ? 'Collapse' : 'Expand'} hasArrow>
            <IconButton
              aria-label="Toggle"
              icon={expanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
              size="xs"
              variant="ghost"
              onClick={() => setExpanded((o) => !o)}
            />
          </Tooltip>
        ) : null}
      </HStack>
      <Code
        display="block"
        whiteSpace="pre"
        p={3}
        bg="gray.800"
        color="gray.100"
        fontFamily="mono"
        fontSize="2xs"
        maxHeight={expanded || !long ? undefined : `${collapsedHeight}px`}
        overflow="auto"
      >
        {value}
      </Code>
    </Box>
  );
}

function ProofTab({ entry }: { entry: QueryProofEntry }) {
  const [parsedTree, setParsedTree] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);

  // Auto-parse on mount. The Proof tab itself only mounts when the user opens
  // it (Chakra TabPanel is lazy), so the ~146KB WASM module is still fetched
  // on demand — no upfront cost for query entries the user never expands.
  useEffect(() => {
    const proof = entry.proof?.grovedbProof;
    if (!proof) return;
    let cancelled = false;
    setParsing(true);
    (async () => {
      try {
        const { parseGrovedbProof } = await import('@/lib/grovedb-proof-parser');
        const text = await parseGrovedbProof(proof);
        if (!cancelled) setParsedTree(text);
      } catch (e) {
        if (!cancelled) setParsedTree(`Parse error: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        if (!cancelled) setParsing(false);
      }
    })();
    return () => { cancelled = true; };
  }, [entry.proof]);

  if (!entry.hasProofVariant) {
    return (
      <Text fontSize="xs" color="gray.400">
        This SDK method does not return a proof. It is informational only.
      </Text>
    );
  }

  if (!entry.proof) {
    return (
      <VStack align="stretch" spacing={2}>
        <Text fontSize="xs" color="gray.400">
          No proof captured. {entry.error
            ? 'The proof variant errored — the data above came from the unproven fallback path.'
            : 'Either trusted mode is off or the inspector was disabled when this query ran.'}
        </Text>
        {entry.error ? (
          <Text fontSize="2xs" color="red.300" fontFamily="mono">
            {entry.error}
          </Text>
        ) : null}
      </VStack>
    );
  }

  const { proof, metadata } = entry;
  const proofHex = toHex(proof.grovedbProof);

  return (
    <VStack align="stretch" spacing={4}>
      {metadata ? (
        <Box>
          <Text fontSize="xs" fontWeight="600" color="gray.200" mb={2}>Response Metadata</Text>
          <VStack align="stretch" spacing={1.5} pl={2} borderLeft="2px solid" borderColor="gray.750">
            <FieldRow label="Height" value={String(metadata.height)} annotation={PROOF_FIELD_ANNOTATIONS.height} />
            <FieldRow label="Epoch" value={String(metadata.epoch)} annotation={PROOF_FIELD_ANNOTATIONS.epoch} />
            <FieldRow label="Core Height" value={String(metadata.coreChainLockedHeight)} annotation={PROOF_FIELD_ANNOTATIONS.coreChainLockedHeight} />
            <FieldRow label="Time" value={new Date(metadata.timeMs).toISOString()} annotation={PROOF_FIELD_ANNOTATIONS.timeMs} />
            <FieldRow label="Protocol" value={String(metadata.protocolVersion)} annotation={PROOF_FIELD_ANNOTATIONS.protocolVersion} />
            <FieldRow label="Chain ID" value={metadata.chainId} annotation={PROOF_FIELD_ANNOTATIONS.chainId} />
          </VStack>
        </Box>
      ) : null}

      <Box>
        <Text fontSize="xs" fontWeight="600" color="gray.200" mb={2}>Quorum Signature</Text>
        <VStack align="stretch" spacing={1.5} pl={2} borderLeft="2px solid" borderColor="gray.750">
          <FieldRow label="Quorum Hash" value={toHex(proof.quorumHash)} annotation={PROOF_FIELD_ANNOTATIONS.quorumHash} />
          <FieldRow label="Quorum Type" value={String(proof.quorumType)} annotation={PROOF_FIELD_ANNOTATIONS.quorumType} />
          <FieldRow label="Round" value={String(proof.round)} annotation={PROOF_FIELD_ANNOTATIONS.round} />
          <FieldRow label="Block ID" value={toHex(proof.blockIdHash)} annotation={PROOF_FIELD_ANNOTATIONS.blockIdHash} />
          <FieldRow label="Signature" value={toHex(proof.signature)} annotation={PROOF_FIELD_ANNOTATIONS.signature} />
        </VStack>
      </Box>

      <Box>
        <HStack justify="space-between" mb={2}>
          <Text fontSize="xs" fontWeight="600" color="gray.200">
            GroveDB Proof ({formatBytes(proof.grovedbProof.length)})
          </Text>
          {parsing ? (
            <HStack spacing={2}>
              <Spinner size="xs" color="gray.500" />
              <Text fontSize="2xs" color="gray.500">Parsing…</Text>
            </HStack>
          ) : null}
        </HStack>
        <Text fontSize="2xs" color="gray.500" mb={2}>
          {PROOF_FIELD_ANNOTATIONS.grovedbProof}
        </Text>
        {parsedTree ? (
          <Box mt={3}>
            <Text fontSize="xs" fontWeight="600" color="gray.200" mb={2}>What this proof contains</Text>
            <ProofExplainer text={parsedTree} />
            <Text fontSize="2xs" color="gray.400" fontWeight="600" textTransform="uppercase" mt={4} mb={2}>
              Proof tree
            </Text>
            <ProofTreeView text={parsedTree} />
            <Text fontSize="2xs" color="gray.400" fontWeight="600" textTransform="uppercase" mt={4} mb={1}>
              Raw bytes ({formatBytes(proof.grovedbProof.length)})
            </Text>
            <MiniCodeBlock value={proofHex} collapsedHeight={120} />
            <Text fontSize="2xs" color="gray.400" fontWeight="600" textTransform="uppercase" mt={4} mb={1}>
              Raw parser output
            </Text>
            <MiniCodeBlock value={parsedTree} collapsedHeight={400} />
          </Box>
        ) : !parsing ? (
          <MiniCodeBlock value={proofHex} collapsedHeight={120} />
        ) : null}
      </Box>
    </VStack>
  );
}

export function QueryEntryCard({ entry }: { entry: QueryProofEntry }) {
  const annotation = METHOD_ANNOTATIONS[entry.methodName];

  return (
    <AccordionItem border="none" mb={1}>
      <AccordionButton
        px={3}
        py={2}
        borderRadius="md"
        _hover={{ bg: 'raised' }}
        _expanded={{ bg: 'raised' }}
      >
        <HStack flex="1" spacing={2} align="center">
          <Badge
            colorScheme={entry.proof ? 'green' : entry.hasProofVariant ? 'yellow' : 'gray'}
            fontSize="2xs"
            variant="subtle"
          >
            {entry.proof ? 'proven' : entry.hasProofVariant ? 'unproven' : 'no proof'}
          </Badge>
          <Text fontSize="xs" fontFamily="mono" color="gray.100" fontWeight="500">
            {entry.methodName}
          </Text>
        </HStack>
        <HStack spacing={2}>
          {entry.status === 'error' ? (
            <Badge colorScheme="red" fontSize="2xs">error</Badge>
          ) : null}
          <Text fontSize="2xs" color="gray.400" fontFamily="mono">
            {entry.durationMs}ms
          </Text>
        </HStack>
      </AccordionButton>
      <AccordionPanel px={3} pb={4}>
        <Tabs size="sm" variant="soft-rounded" colorScheme="gray">
          <TabList mb={3}>
            <Tab fontSize="xs" _selected={{ bg: 'sunken', color: 'ink' }}>Query</Tab>
            <Tab fontSize="xs" _selected={{ bg: 'sunken', color: 'ink' }}>Result</Tab>
            {entry.hasProofVariant ? (
              <Tab fontSize="xs" _selected={{ bg: 'sunken', color: 'ink' }}>Proof</Tab>
            ) : null}
          </TabList>
          <TabPanels>
            <TabPanel px={0}>
              <VStack align="stretch" spacing={3}>
                <Box>
                  <Text fontSize="2xs" color="gray.400" fontWeight="600" textTransform="uppercase" mb={1}>Method</Text>
                  <Text fontSize="xs" fontFamily="mono" color="gray.100">{entry.methodName}</Text>
                </Box>
                {annotation ? (
                  <Text fontSize="xs" color="gray.400" lineHeight="1.5">{annotation}</Text>
                ) : null}
                <Box>
                  <Text fontSize="2xs" color="gray.400" fontWeight="600" textTransform="uppercase" mb={1}>Parameters</Text>
                  <MiniCodeBlock value={JSON.stringify(entry.methodParams, null, 2)} collapsedHeight={200} />
                </Box>
              </VStack>
            </TabPanel>
            <TabPanel px={0}>
              <VStack align="stretch" spacing={3}>
                {entry.status === 'error' ? (
                  <Text fontSize="xs" color="red.300">{entry.error}</Text>
                ) : (
                  <MiniCodeBlock
                    value={typeof entry.result === 'string' ? entry.result : JSON.stringify(entry.result, null, 2)}
                    collapsedHeight={400}
                  />
                )}
              </VStack>
            </TabPanel>
            {entry.hasProofVariant ? (
              <TabPanel px={0}>
                <ProofTab entry={entry} />
              </TabPanel>
            ) : null}
          </TabPanels>
        </Tabs>
      </AccordionPanel>
    </AccordionItem>
  );
}
