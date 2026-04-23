'use client';

import { useMemo, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Code,
  FormControl,
  FormLabel,
  HStack,
  Heading,
  Input,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  VStack,
} from '@chakra-ui/react';
import { InfoBlock } from '@ui/InfoBlock';
import { LoadingCard } from '@ui/LoadingCard';
import { ErrorCard } from '@ui/ErrorCard';
import { usePathElements } from '@sdk/queries';

interface Preset {
  key: string;
  label: string;
  description: string;
  path: string[];
  keys: string[];
}

// The `path` entries are parsed server-side as u8 if they look like a decimal
// number, otherwise taken as UTF-8 bytes. Keys are always UTF-8 bytes. Thus
// every byte-valued path below is written as its decimal byte; ASCII string
// keys ("D", "T") work directly. Binary 32-byte IDs cannot be round-tripped
// through this wrapper — see docs/research/2026-04-22-path-query-and-token-lookup.md.
const PRESETS: Preset[] = [
  {
    key: 'total-credits',
    label: 'Total system credits',
    description:
      "Misc/'D' → the protocol-wide system credit supply. Single-key read at path [104], key 'D'.",
    path: ['104'],
    keys: ['D'],
  },
  {
    key: 'identities-probe',
    label: 'Identities root · probe',
    description:
      'Probes the Identities root at path [32] with an ASCII-safe stub key. This is a feature test: the value is not meaningful because identity IDs are 32 bytes of raw entropy and cannot be encoded as a UTF-8 JS string through this wrapper. Use it to confirm the primitive responds, not to list identities.',
    path: ['32'],
    keys: ['A'],
  },
  {
    key: 'contracts-probe',
    label: 'DataContractDocuments root · probe',
    description:
      'Probes the DataContractDocuments root at path [64]. Same caveat as above — contract IDs are 32 bytes; the wrapper can only take UTF-8 keys.',
    path: ['64'],
    keys: ['A'],
  },
  {
    key: 'tokens-contract-infos',
    label: 'Tokens · contract-info subtree',
    description:
      "Path [16, 160] is the token → contract reverse index. Would accept 32-byte token IDs as keys — but binary keys don't round-trip through this wrapper. Use the typed endpoint (/token/?id=…, which calls tokens.contractInfo(tokenId)) instead.",
    path: ['16', '160'],
    keys: ['A'],
  },
];

function parseList(input: string): string[] {
  return input
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function PathElementsTool() {
  const [pathInput, setPathInput] = useState(PRESETS[0]!.path.join(', '));
  const [keysInput, setKeysInput] = useState(PRESETS[0]!.keys.join(', '));
  const [submitted, setSubmitted] = useState<{ path: string[]; keys: string[] } | null>({
    path: PRESETS[0]!.path,
    keys: PRESETS[0]!.keys,
  });

  const q = usePathElements(submitted?.path, submitted?.keys);

  const submit = () => {
    const path = parseList(pathInput);
    const keys = parseList(keysInput);
    setSubmitted({ path, keys });
  };

  const applyPreset = (preset: Preset) => {
    setPathInput(preset.path.join(', '));
    setKeysInput(preset.keys.join(', '));
    setSubmitted({ path: preset.path, keys: preset.keys });
  };

  const rows = useMemo(() => {
    const elements = Array.isArray(q.data) ? (q.data as Array<unknown>) : [];
    return elements.map((el, i) => {
      const rec = el as Record<string, unknown>;
      const elPath = Array.isArray(rec.path) ? rec.path.map(String) : [];
      const value =
        typeof rec.value === 'string'
          ? rec.value
          : rec.value === null || rec.value === undefined
            ? null
            : String(rec.value);
      return { i, path: elPath, value };
    });
  }, [q.data]);

  return (
    <VStack align="stretch" spacing={4}>
      <InfoBlock>
        <VStack align="stretch" spacing={3}>
          <Heading size="sm" color="gray.100">
            Raw GroveDB KeysInPath read
          </Heading>
          <Text fontSize="xs" color="gray.400" maxW="80ch">
            Calls <Code fontSize="2xs">system.pathElements(path, keys)</Code> on the EVO SDK, which
            forwards to wasm-sdk&apos;s <Code fontSize="2xs">getPathElements</Code>. This is a
            batched point-get — not a range scan, not an enumerator. Decimal strings in{' '}
            <Code fontSize="2xs">path</Code> (like <Code fontSize="2xs">&quot;32&quot;</Code>) are
            parsed as a single byte; everything else is taken as UTF-8. Keys are UTF-8
            too, so 32-byte binary identifiers don&apos;t round-trip safely through this
            wrapper. Values come back base64-encoded.
          </Text>
          <HStack spacing={2} flexWrap="wrap">
            {PRESETS.map((p) => (
              <Button key={p.key} size="xs" variant="outline" onClick={() => applyPreset(p)}>
                {p.label}
              </Button>
            ))}
          </HStack>
        </VStack>
      </InfoBlock>

      <InfoBlock>
        <VStack align="stretch" spacing={3}>
          <FormControl>
            <FormLabel htmlFor="path-input-id" fontSize="xs" color="gray.400" mb={1}>
              Path (comma-separated — decimal u8 or ASCII string)
            </FormLabel>
            <Input
              id="path-input-id"
              value={pathInput}
              onChange={(e) => setPathInput(e.target.value)}
              fontFamily="mono"
              size="sm"
              bg="gray.800"
              borderColor="gray.700"
            />
          </FormControl>
          <FormControl>
            <FormLabel htmlFor="keys-input-id" fontSize="xs" color="gray.400" mb={1}>
              Keys (comma-separated — UTF-8 bytes)
            </FormLabel>
            <Input
              id="keys-input-id"
              value={keysInput}
              onChange={(e) => setKeysInput(e.target.value)}
              fontFamily="mono"
              size="sm"
              bg="gray.800"
              borderColor="gray.700"
            />
          </FormControl>
          <HStack>
            <Button colorScheme="blue" size="sm" onClick={submit}>
              Read
            </Button>
            {submitted ? (
              <Badge variant="subtle" colorScheme="gray" fontSize="2xs" textTransform="none">
                path=[{submitted.path.join(', ')}] · keys=[{submitted.keys.join(', ')}]
              </Badge>
            ) : null}
          </HStack>
        </VStack>
      </InfoBlock>

      <InfoBlock>
        <Heading size="sm" mb={3} color="gray.100">
          Result
        </Heading>
        {!submitted ? (
          <Text fontSize="sm" color="gray.400">
            Pick a preset or type a path and press Read.
          </Text>
        ) : q.isLoading ? (
          <LoadingCard lines={2} />
        ) : q.isError ? (
          <ErrorCard error={q.error} onRetry={() => q.refetch()} />
        ) : rows.length === 0 ? (
          <Text fontSize="sm" color="gray.400">
            Empty response. (No matching keys, or the server returned nothing at this path.)
          </Text>
        ) : (
          <Box overflowX="auto">
            <Table size="sm">
              <Thead>
                <Tr>
                  <Th color="gray.400" borderColor="gray.750">Key</Th>
                  <Th color="gray.400" borderColor="gray.750">Value (base64)</Th>
                </Tr>
              </Thead>
              <Tbody>
                {rows.map((r) => (
                  <Tr key={r.i} _hover={{ bg: 'gray.800' }}>
                    <Td borderColor="gray.750">
                      <Code fontSize="xs">{r.path.join(', ')}</Code>
                    </Td>
                    <Td borderColor="gray.750">
                      {r.value === null ? (
                        <Text color="gray.500" fontSize="xs">null (not found)</Text>
                      ) : (
                        <Code fontSize="xs" whiteSpace="pre-wrap" wordBreak="break-all">
                          {r.value}
                        </Code>
                      )}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </Box>
        )}
      </InfoBlock>

      <InfoBlock>
        <Heading size="sm" mb={2} color="gray.100">
          Why not list all identities/contracts/tokens with this?
        </Heading>
        <Text fontSize="xs" color="gray.400" lineHeight="1.7" maxW="80ch">
          The underlying request type is GroveDB&apos;s <Code fontSize="2xs">KeysInPath</Code>,
          which answers &quot;give me these exact keys at this path&quot; — there is no range,
          no scan, and no subquery mode. Enumeration would need <Code fontSize="2xs">PathQuery</Code> /{' '}
          <Code fontSize="2xs">SizedQuery</Code> with <Code fontSize="2xs">QueryItem::All</Code>,
          which exists in <Code fontSize="2xs">rs-drive</Code> but is not bound in wasm-sdk yet.
          See{' '}
          <Code fontSize="2xs">
            docs/research/2026-04-22-path-query-and-token-lookup.md
          </Code>
          .
        </Text>
      </InfoBlock>
    </VStack>
  );
}
